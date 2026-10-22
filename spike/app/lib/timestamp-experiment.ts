import type { WhisperForConditionalGeneration } from "@huggingface/transformers";
type TimestampModel = Pick<
  WhisperForConditionalGeneration,
  "_extract_token_timestamps"
>;

export async function withPromptRowTimingFix<T>(
  model: TimestampModel,
  work: () => Promise<T>,
): Promise<T> {
  const original = model._extract_token_timestamps;
  // Opt-in equivalent of upstream PR #1809 for pinned 4.3.1. Keep the last
  // prompt attention row in DTW; restore prefix padding and remove the
  // duplicated EOS time independently per batch. No SRT-derived offset.
  model._extract_token_timestamps = function (
    outputs,
    heads,
    frames,
    precision,
    prefix = 0,
  ) {
    const result = original.call(
      this,
      outputs,
      heads,
      frames,
      precision,
      Math.max(prefix - 1, 0),
    );
    const values = result.data as Float32Array;
    const [batch, width] = result.dims;
    for (let b = 0; b < batch; b++) {
      const offset = b * width;
      values.copyWithin(offset + 1, offset, offset + width - 1);
      values[offset] = 0;
    }
    return result;
  };
  try {
    return await work();
  } finally {
    model._extract_token_timestamps = original;
  }
}
