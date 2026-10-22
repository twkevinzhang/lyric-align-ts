export type Features = { data: Float32Array; frames: number; bands: number };
export function featureFrameCount(samples: number) {
  return Math.floor(samples / 160) + 1;
}
export function featureWindow(f: Features, seek: number, size = 3000) {
  const output = new Float32Array(f.bands * size),
    count = Math.max(0, Math.min(size, f.frames - 1 - seek));
  for (let band = 0; band < f.bands; band++)
    output.set(
      f.data.subarray(band * f.frames + seek, band * f.frames + seek + count),
      band * size,
    );
  return output;
}
/** Pinned Transformers.js feature extractor only (not pipeline/generate).
 * Its STFT/mel implementation supports whole-song frames; remove the 3000-frame
 * cap for this call and pad exactly one 160-sample hop as faster-whisper does.
 * Normalization happens once over the entire song, before seek slicing.
 */
export async function wholeSongFeatures(
  audio: Float32Array,
  extractor: {
    config: { nb_max_frames: number };
    _extract_fbank_features: (
      waveform: Float32Array,
    ) => Promise<{ data: unknown; dims: number[]; dispose: () => unknown }>;
  },
): Promise<Features> {
  if (!audio.length) throw Error("Empty audio");
  const padded = new Float32Array(audio.length + 160);
  padded.set(audio);
  const limit = extractor.config.nb_max_frames;
  extractor.config.nb_max_frames = featureFrameCount(audio.length);
  try {
    const t = await extractor._extract_fbank_features(padded);
    try {
      const [bands, frames] = t.dims;
      if (frames !== featureFrameCount(audio.length) || bands !== 80)
        throw Error(`Unexpected feature shape ${t.dims}`);
      return {
        data: Float32Array.from(t.data as ArrayLike<number>),
        frames,
        bands,
      };
    } finally {
      await t.dispose();
    }
  } finally {
    extractor.config.nb_max_frames = limit;
  }
}
