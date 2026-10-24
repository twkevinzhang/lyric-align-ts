import { DEFAULT_MODEL_URL, DEFAULT_MODEL_SHA256 } from './model.ts';
import type { Capabilities, ErrorCode, LyricAlignBinding, LyricAlignSession, OperationContext, Progress } from './contract.ts';
export type * from './contract.ts';

export interface BindingOptions {
  workerUrl?: string | URL;
  assetBaseUrl?: string | URL;
  /** Relocate the pinned model; its SHA256 is always verified. */
  modelUrl?: string | URL;
  threads?: 1 | 2 | 4 | 6 | 8 | 12;
}

export function libraryError(code: ErrorCode, message: string): Error & { code: ErrorCode } {
  return Object.assign(new Error(message), { code });
}
const codes: readonly string[] = ['UNSUPPORTED_LANGUAGE','UNSUPPORTED_DEVICE','UNSUPPORTED_OPTION','MODEL_LOAD_FAILED','INVALID_INPUT','OUT_OF_MEMORY','TRANSCRIPTION_FAILED','ALIGNMENT_FAILED','ABORTED'];
function normalizeError(value: unknown, fallback: ErrorCode) {
  const error = value as { code?: string; message?: string } | null;
  const message = typeof error?.message === 'string' ? error.message : String(value);
  const code = codes.includes(error?.code ?? '') ? error!.code as ErrorCode
    : /out of memory|cannot allocate memory|allocation failed|memory access out of bounds/i.test(message) ? 'OUT_OF_MEMORY' : fallback;
  return libraryError(code, message);
}
const capabilities: Capabilities = Object.freeze({
  contractVersion: 1, libraryVersion: '1.0.1',
  supportedLanguages: Object.freeze(['en', 'ja', 'zh']),
  model: Object.freeze({ id: 'ggerganov/whisper.cpp/ggml-tiny-q5_1.bin', revision: '5359861c739e955e79d9a303bcbc70fb988958b1', device: 'wasm' as const, dtype: 'q5_1' }),
  alignmentOptions: Object.freeze(['threshold', 'karaoke'] as const), lyricsContext: false,
});
function language(value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !capabilities.supportedLanguages.includes(value)) throw libraryError('UNSUPPORTED_LANGUAGE', `Unsupported language: ${String(value)}`);
  return value;
}
function optionsOnly(options: object, keys: readonly string[]) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw libraryError('INVALID_INPUT', 'Options must be an object');
  for (const key of Object.keys(options)) if (!keys.includes(key)) throw libraryError('UNSUPPORTED_OPTION', `Unsupported option: ${key}`);
}

/** No model, Worker, fetch or device access occurs until prepare(). */
export function createBinding(options: BindingOptions = {}): LyricAlignBinding {
  optionsOnly(options, ['workerUrl', 'assetBaseUrl', 'modelUrl', 'threads']);
  const config = { ...options };
  if (![1,2,4,6,8,12].includes(config.threads ?? 8)) throw libraryError('UNSUPPORTED_OPTION', 'Unsupported thread count');
  return Object.freeze({ capabilities, async createSession(): Promise<LyricAlignSession> {
    let worker: Worker | undefined, disposed = false, ready = false, busy = false, preparedLanguage = 'en', requestId = 0;
    let active: { id: number; reject: (error: unknown) => void; resolve: (value: any) => void; progress: (data: any) => void; code: ErrorCode } | undefined;
    function stop(error = libraryError('ABORTED', 'Session disposed')) {
      disposed = true; ready = false;
      worker?.terminate(); worker = undefined;
      const current = active; active = undefined; current?.reject(error);
    }
    function request(message: Record<string, unknown>, code: ErrorCode, progress: (data: any) => void, transfer: Transferable[] = []) {
      return new Promise<any>((resolve, reject) => {
        const id = ++requestId;
        active = { id, resolve, reject, progress, code };
        try { worker!.postMessage({ ...message, id }, transfer); }
        catch (error) { active = undefined; reject(normalizeError(error, code)); }
      });
    }
    async function operation<T>(phase: Progress['phase'], context: OperationContext, work: (emit: (data?: any) => void) => Promise<T>): Promise<T> {
      if (!context?.signal || typeof context.signal.addEventListener !== 'function') throw libraryError('INVALID_INPUT', 'An AbortSignal is required');
      if (context.signal.aborted) throw libraryError('ABORTED', 'Operation aborted');
      if (disposed || busy) throw libraryError('INVALID_INPUT', disposed ? 'Session is disposed' : 'Session is busy');
      busy = true;
      let sequence = 0;
      const emit = (data?: any) => {
        if (disposed || context.signal.aborted) return;
        const base = { phase, sequence: ++sequence, ...(typeof data?.stage === 'string' ? { detail: data.stage } : {}) };
        // Only explicitly typed native measurements can be forwarded. Legacy
        // sample counters and untyped model totals are deliberately indeterminate.
        const measured = data?.kind === 'measured' && Number.isFinite(data.completed) && Number.isFinite(data.total)
          && data.total > 0 && data.completed >= 0 && data.completed <= data.total
          && ['bytes','seconds','items'].includes(data.unit) && typeof data.scope === 'string' && data.scope.length > 0;
        const event: Progress = measured ? { ...base, kind: 'measured', completed: data.completed, total: data.total, unit: data.unit, scope: data.scope } : { ...base, kind: 'indeterminate' };
        try { context.onProgress?.(event); } catch { /* Observers cannot break computation. */ }
      };
      const abort = () => stop(libraryError('ABORTED', 'Operation aborted'));
      context.signal.addEventListener('abort', abort, { once: true });
      try {
        emit();
        if (disposed || context.signal.aborted) throw libraryError('ABORTED', 'Operation aborted');
        const result = await work(emit);
        if (disposed || context.signal.aborted) throw libraryError('ABORTED', 'Operation aborted');
        return result;
      }
      catch (error) { throw normalizeError(error, phase === 'preparing-model' ? 'MODEL_LOAD_FAILED' : phase === 'transcribing' ? 'TRANSCRIPTION_FAILED' : 'ALIGNMENT_FAILED'); }
      finally { busy = false; context.signal.removeEventListener('abort', abort); }
    }
    return {
      prepare(opts, context) {
        return operation('preparing-model', context, async emit => {
          optionsOnly(opts, ['language']); const selected = language(opts.language, preparedLanguage);
          if (ready) { preparedLanguage = selected; return; }
          if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined' || typeof SharedArrayBuffer === 'undefined' || !globalThis.crossOriginIsolated || !globalThis.isSecureContext) throw libraryError('UNSUPPORTED_DEVICE', 'tiny/WASM requires a secure cross-origin-isolated browser with Worker and SharedArrayBuffer');
          try {
            worker = new Worker(new URL(String(config.workerUrl ?? './worker.js'), import.meta.url));
            worker.addEventListener('message', ({ data }) => {
              const current = active; if (!current || data?.id !== current.id) return;
              if (data.type === 'progress') current.progress(data);
              else if (data.type === 'result') { active = undefined; current.resolve(data.result); }
              else if (data.type === 'error') { active = undefined; current.reject(normalizeError(data.error, current.code)); }
            });
            const crash = (message: string) => stop(libraryError(active?.code ?? 'MODEL_LOAD_FAILED', message));
            worker.addEventListener('error', event => crash(event.message || 'Worker crashed'));
            worker.addEventListener('messageerror', () => crash('Could not deserialize Worker response'));
            const base = new URL(String(config.assetBaseUrl ?? './assets/'), import.meta.url); if (!base.pathname.endsWith('/')) base.pathname += '/';
            await request({ type: 'initialize', options: { modelUrl: String(config.modelUrl ?? DEFAULT_MODEL_URL), modelSha256: DEFAULT_MODEL_SHA256, assetBaseUrl: base.href, threads: config.threads ?? 8 } }, 'MODEL_LOAD_FAILED', emit);
            ready = true; preparedLanguage = selected;
          } catch (error) { const normalized = normalizeError(error, 'MODEL_LOAD_FAILED'); stop(normalized); throw normalized; }
        });
      },
      transcribe(audio, opts, context) {
        return operation('transcribing', context, async emit => {
          if (!ready) throw libraryError('INVALID_INPUT', 'Call prepare before transcribe');
          optionsOnly(opts, ['language']); const selected = language(opts.language, preparedLanguage);
          if (!audio || audio.sampleRate !== 16000 || !(audio.pcm instanceof Float32Array) || !audio.pcm.length) throw libraryError('INVALID_INPUT', 'Expected nonempty mono Float32Array PCM at 16000 Hz');
          for (const sample of audio.pcm) if (!Number.isFinite(sample)) throw libraryError('INVALID_INPUT', 'PCM samples must be finite');
          const copy = audio.pcm.slice();
          return request({ type: 'transcribe', audio: copy, language: selected }, 'TRANSCRIPTION_FAILED', emit, [copy.buffer]);
        });
      },
      align(segments, lyrics, opts, context) {
        return operation('aligning', context, async emit => {
          if (!ready) throw libraryError('INVALID_INPUT', 'Call prepare before align');
          optionsOnly(opts, ['threshold','karaoke']);
          if (opts.karaoke !== undefined && opts.karaoke !== false) throw libraryError('UNSUPPORTED_OPTION', 'Only karaoke=false is supported');
          if (opts.threshold !== undefined && (!Number.isFinite(opts.threshold) || opts.threshold < 0 || opts.threshold > 1)) throw libraryError('INVALID_INPUT', 'threshold must be between 0 and 1');
          return request({ type: 'align-segments', segments, lyrics, options: opts }, 'ALIGNMENT_FAILED', emit);
        });
      },
      async dispose() { stop(); },
    };
  } });
}
export const binding = createBinding();
