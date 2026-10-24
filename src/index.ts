import { prepareAudio } from './audio.ts';
import { timelineToCues, toSrt } from './cues.ts';
import type { Aligner, AlignerOptions, AlignmentMetrics, AlignmentResult, Progress, TimelineEntry, Cue } from './types.ts';
export { timelineToCues, toSrt } from './cues.ts';
export { parseSrt } from './subtitles.ts';
export type { SourceCue } from './subtitles.ts';
export type * from './types.ts';

import { DEFAULT_MODEL_URL, DEFAULT_MODEL_SHA256 } from './model.ts';
export { DEFAULT_MODEL_URL, DEFAULT_MODEL_SHA256 } from './model.ts';
export { binding, createBinding } from './binding.ts';
export type { BindingOptions } from './binding.ts';
export type { LyricAlignBinding, LyricAlignSession, Capabilities, OperationContext, PrepareOptions, TranscribeOptions, AlignOptions, Segment, Word, AlignedLine, ErrorCode, LibraryError, AudioInput as ContractAudioInput, Progress as ContractProgress } from './contract.ts';
type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; progress?: (p: Progress) => void };
const abortError = () => new DOMException('Alignment was aborted; create a new aligner to continue', 'AbortError');

export async function createAligner(options: AlignerOptions = {}): Promise<Aligner> {
  const initializeStart = performance.now();
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined' || typeof SharedArrayBuffer === 'undefined') throw new Error('This runtime requires browser Worker, WebAssembly and SharedArrayBuffer');
  if (!globalThis.crossOriginIsolated) throw new Error('Cross-origin isolation required: serve COOP: same-origin and COEP: require-corp headers');
  if (!globalThis.isSecureContext) throw new Error('A secure context (HTTPS or localhost) is required');
  const threads = options.threads ?? 8;
  if (![1, 2, 4, 6, 8, 12].includes(threads)) throw new TypeError('threads must be 1, 2, 4, 6, 8 or 12');
  const modelSha256 = options.modelSha256 ?? DEFAULT_MODEL_SHA256;
  if (!/^[a-f0-9]{64}$/i.test(modelSha256)) throw new TypeError('modelSha256 must be a 64-character SHA256 hash');
  options.signal?.throwIfAborted();
  const assetBaseUrl = new URL(String(options.assetBaseUrl ?? './assets/'), import.meta.url);
  if (!assetBaseUrl.pathname.endsWith('/')) assetBaseUrl.pathname += '/';
  const worker = new Worker(new URL(String(options.workerUrl ?? './worker.js'), import.meta.url));
  const pending = new Map<number, Pending>();
  const lifetime = new AbortController();
  let sequence = 0, disposed = false, busy = false;
  const stop = (error = new Error('Aligner is disposed')) => {
    if (disposed) return;
    disposed = true;
    lifetime.abort(error);
    worker.terminate();
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  worker.addEventListener('message', ({ data }) => {
    const request = pending.get(data?.id);
    if (!request) return;
    if (data.type === 'progress') {
      try { request.progress?.({ stage: data.stage, completed: data.completed, total: data.total }); } catch { /* Observer failures cannot corrupt inference. */ }
    } else if (data.type === 'result') { pending.delete(data.id); request.resolve(data.result); }
    else if (data.type === 'error') { pending.delete(data.id); const error = new Error(data.error?.message ?? 'Worker failed'); error.name = data.error?.name ?? 'Error'; request.reject(error); }
  });
  worker.addEventListener('error', event => stop(new Error(event.message || 'Alignment Worker failed')));
  worker.addEventListener('messageerror', () => stop(new Error('Could not deserialize Worker response')));
  const request = <T>(message: Record<string, unknown>, progress?: (p: Progress) => void, transfer: Transferable[] = []) => new Promise<T>((resolve, reject) => {
    if (disposed) { reject(new Error('Aligner is disposed')); return; }
    const id = ++sequence;
    pending.set(id, { resolve, reject, progress });
    try { worker.postMessage({ ...message, id }, transfer); } catch (error) { pending.delete(id); reject(error); }
  });
  const initializeAbort = () => stop(abortError());
  options.signal?.addEventListener('abort', initializeAbort, { once: true });
  try {
    await request({ type: 'initialize', options: { modelUrl: String(options.modelUrl ?? DEFAULT_MODEL_URL), modelSha256: modelSha256.toLowerCase(), assetBaseUrl: assetBaseUrl.href, threads } }, options.onProgress);
  } catch (error) { stop(); throw error; }
  finally { options.signal?.removeEventListener('abort', initializeAbort); }
  const initializationSeconds = (performance.now() - initializeStart) / 1000;
  return {
    async align(input): Promise<AlignmentResult> {
      if (disposed) throw new Error('Aligner is disposed');
      if (busy) throw new Error('An alignment is already in progress (instance is busy)');
      input.signal?.throwIfAborted();
      const lines = (typeof input.lyrics === 'string' ? input.lyrics.split(/\r?\n/) : input.lyrics).map(line => line.trim()).filter(Boolean);
      if (!lines.length || !lines.some(line => /[\p{L}\p{N}]/u.test(line))) throw new TypeError('lyrics must include spoken text');
      if (typeof input.language !== 'string' || !/^[a-z]{2,3}$/.test(input.language)) throw new TypeError('language must be an explicit ISO language code, e.g. en or ja');
      busy = true;
      const operationStart = performance.now();
      const onAbort = () => stop(abortError());
      input.signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const samples = await prepareAudio(input.audio, lifetime.signal);
        const audioPreparationSeconds = (performance.now() - operationStart) / 1000;
        if (disposed || input.signal?.aborted) throw abortError();
        const audioSeconds = samples.length / 16000;
        const result = await request<{ words: TimelineEntry[]; metrics: AlignmentMetrics; cues?: Cue[] }>({ type: 'align', audio: samples, lyrics: lines.join('\n'), language: input.language }, input.onProgress, [samples.buffer]);
        const cueStart = performance.now();
        const cues = result.cues ?? timelineToCues(lines, result.words, audioSeconds);
        const srt = toSrt(cues);
        const cueMappingSeconds = (performance.now() - cueStart) / 1000;
        const operationSeconds = (performance.now() - operationStart) / 1000;
        return { ...result, cues, srt, audioSeconds, metrics: { ...result.metrics, engineTotalSeconds: result.metrics.totalSeconds, initializationSeconds, audioPreparationSeconds, cueMappingSeconds, operationSeconds, totalSeconds: initializationSeconds + operationSeconds } };
      } finally { busy = false; input.signal?.removeEventListener('abort', onAbort); }
    },
    dispose() { stop(); },
  };
}
