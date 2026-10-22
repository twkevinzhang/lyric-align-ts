import type {
  AutomaticSpeechRecognitionPipeline,
  Tensor,
} from "@huggingface/transformers";
import { ctcAlign } from "./lib/ctc-alignment";
import { parseLyrics } from "./lib/alignment";

/** Browser-only q4 acoustic inference and supplied-text alignment; SRT is not an input. */
export async function runCtcExperiment(
  pipe: AutomaticSpeechRecognitionPipeline,
  audio: Float32Array,
  lyrics: string,
  progress: (label: string) => void,
) {
  const sampleRate = 16000,
    windowSamples = 20 * sampleRate,
    stride = 2 * sampleRate;
  const ratio = Number(
    (pipe.model.config as { inputs_to_logits_ratio?: number })
      .inputs_to_logits_ratio ?? 320,
  );
  const vocabulary = pipe.tokenizer.get_vocab(),
    blank = pipe.tokenizer.pad_token_id;
  const separator = vocabulary.get("|");
  if (separator === undefined || ratio !== 320)
    throw new Error("Unexpected CTC model configuration");
  const target: number[] = [];
  const words: {
    text: string;
    lineIndex: number;
    first: number;
    last: number;
  }[] = [];
  parseLyrics(lyrics).forEach((line, lineIndex) => {
    const textWords =
      line
        .replaceAll("’", "'")
        .toUpperCase()
        .match(/[A-Z]+(?:'[A-Z]+)*/g) ?? [];
    if (!textWords.length)
      throw new Error("CTC experiment requires English lyrics");
    for (const text of textWords) {
      if (target.length) target.push(separator);
      const first = target.length;
      for (const character of text) {
        const id = vocabulary.get(character);
        if (id === undefined || id === blank)
          throw new Error("Unsupported lyric character");
        target.push(id);
      }
      words.push({ text, lineIndex, first, last: target.length - 1 });
    }
  });
  const probabilities: number[] = [],
    frameTimes: number[] = [],
    greedy: number[] = [];
  let vocab = 0,
    windows = 0;
  for (
    let offset = 0;
    offset < audio.length;
    offset += windowSamples - stride * 2
  ) {
    const end = Math.min(offset + windowSamples, audio.length),
      last = end === audio.length;
    progress(`CTC acoustic window ${++windows}`);
    const input = await pipe.processor(audio.subarray(offset, end));
    const result = await pipe.model(input);
    const logits = result.logits as Tensor;
    const [, frames, size] = logits.dims;
    if (vocab && vocab !== size) throw new Error("CTC vocabulary changed");
    vocab = size;
    const values = logits.data as Float32Array;
    for (let frame = 0; frame < frames; frame++) {
      const localSample = (frame + 0.5) * ratio;
      if (
        (offset > 0 && localSample < stride) ||
        (!last && localSample >= windowSamples - stride)
      )
        continue;
      let max = -Infinity,
        best = 0;
      for (let k = 0; k < size; k++)
        if (values[frame * size + k] > max) {
          max = values[frame * size + k];
          best = k;
        }
      let sum = 0;
      for (let k = 0; k < size; k++)
        sum += Math.exp(values[frame * size + k] - max);
      const logZ = max + Math.log(sum);
      for (let k = 0; k < size; k++)
        probabilities.push(values[frame * size + k] - logZ);
      frameTimes.push((offset + localSample) / sampleRate);
      greedy.push(best);
    }
    if (last) break;
  }
  progress("CTC Viterbi alignment against supplied lyrics");
  const spans = ctcAlign(
    new Float32Array(probabilities),
    frameTimes.length,
    vocab,
    target,
    blank,
  );
  const chunks = words.map((word) => {
    const first = spans[word.first],
      last = spans[word.last];
    return {
      text: ` ${word.text}`,
      timestamp: [
        frameTimes[first.startFrame],
        Math.min(
          audio.length / sampleRate,
          frameTimes[last.endFrame - 1] + ratio / sampleRate,
        ),
      ],
      lineIndex: word.lineIndex,
      meanLogProbability:
        spans
          .slice(word.first, word.last + 1)
          .reduce((sum, s) => sum + s.meanLogProbability, 0) /
        (word.last - word.first + 1),
    };
  });
  return {
    text: chunks.map((c) => c.text).join(""),
    text_source: "provided-lyrics-not-recognized",
    raw_asr_text: pipe.tokenizer.decode(greedy, { skip_special_tokens: true }),
    chunks,
    frames: frameTimes.length,
    vocabularySize: vocab,
    acousticWindows: windows,
    targetTokens: target.length,
    frameStepSeconds: ratio / sampleRate,
    warning:
      "Forced alignment always uses supplied text. Confidence is uncalibrated. Assigned words do not prove they were sung or recognized.",
  };
}
