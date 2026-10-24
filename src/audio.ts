import type { AudioInput } from './types.ts';

async function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    operation.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

function validate(samples: Float32Array): Float32Array {
  if (!samples.length) throw new TypeError('Audio must contain at least one sample');
  for (const sample of samples) if (!Number.isFinite(sample)) throw new TypeError('Audio samples must be finite');
  return samples.slice();
}
async function fromBuffer(buffer: AudioBuffer, signal?: AbortSignal): Promise<Float32Array> {
  if (!buffer.numberOfChannels || !buffer.length) throw new TypeError('Audio must not be empty');
  const mono = new Float32Array(buffer.length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const samples = buffer.getChannelData(ch);
    for (let i = 0; i < mono.length; i++) mono[i] += samples[i] / buffer.numberOfChannels;
  }
  if (buffer.sampleRate === 16000) return validate(mono);
  if (typeof OfflineAudioContext === 'undefined') throw new Error('Resampling requires Web Audio OfflineAudioContext');
  const context = new OfflineAudioContext(1, Math.ceil(buffer.length * 16000 / buffer.sampleRate), 16000);
  const source = context.createBufferSource();
  const input = context.createBuffer(1, mono.length, buffer.sampleRate);
  input.copyToChannel(mono, 0);
  source.buffer = input;
  source.connect(context.destination);
  source.start();
  const rendered = await abortable(context.startRendering(), signal);
  return validate(rendered.getChannelData(0));
}
/** File/Blob decoding uses the browser codecs; PCM input is copied, never detached. */
export async function prepareAudio(audio: AudioInput, signal?: AbortSignal): Promise<Float32Array> {
  signal?.throwIfAborted();
  if (audio && typeof audio === 'object' && 'samples' in audio) {
    if (!(audio.samples instanceof Float32Array) || audio.sampleRate !== 16000) throw new TypeError('PCM requires Float32Array samples at sampleRate: 16000');
    return validate(audio.samples);
  }
  if (audio && typeof audio === 'object' && 'getChannelData' in audio) return fromBuffer(audio as AudioBuffer, signal);
  if (typeof Blob !== 'undefined' && audio instanceof Blob) {
    if (typeof AudioContext === 'undefined') throw new Error('Decoding files requires Web Audio AudioContext');
    const context = new AudioContext({ sampleRate: 16000 });
    let closing: Promise<void> | undefined;
    const close = () => closing ??= context.close().catch(() => {});
    const abort = () => { void close(); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const bytes = await abortable(audio.arrayBuffer(), signal);
      const buffer = await abortable(context.decodeAudioData(bytes), signal);
      return await fromBuffer(buffer, signal);
    } finally { signal?.removeEventListener('abort', abort); await close(); }
  }
  throw new TypeError('audio must be a File/Blob, AudioBuffer, or 16000 Hz PCM input');
}
