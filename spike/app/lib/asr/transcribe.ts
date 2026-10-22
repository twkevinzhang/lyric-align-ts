import {
  search,
  maskLogits,
  generationBudget,
  type DecodeRuntime,
  type TokenRules,
  type Options,
} from "./decode.ts";
import {
  TEMPERATURES,
  compressionRatio,
  fallbackDecision,
  selectFallback,
  makePrompt,
  splitTimestamps,
  nextSeek,
} from "./control.ts";
import { attachWords, type TimedWord } from "./word-timing.ts";
import type { Features } from "./features.ts";
export interface AsrRuntime<C> extends DecodeRuntime<C> {
  features(audio: Float32Array): Promise<Features>;
  encode(features: Features, seek: number): Promise<void>;
  clearWindow(): Promise<void>;
  token(s: string): number;
  text(tokens: number[]): string;
  rules(): TokenRules;
  align(
    tokens: number[],
    frames: number,
  ): Promise<{ words: TimedWord[]; jumps: number[] }>;
}
type Decoded = Awaited<ReturnType<typeof search>>;
type Attempt = Decoded & {
  temperature: number;
  text: string;
  compressionRatio: number;
  retry: boolean;
  skip: boolean;
};
export type SeekTrace = {
  seek: number;
  size: number;
  prompt: number[];
  previousTokenRange: [number, number];
  resetSince: number;
  attempts: Attempt[];
  selected: number;
  temperature: number;
  skip: boolean;
  nextSeek: number;
  rawSegments: ReturnType<typeof splitTimestamps>["segments"];
  alignment: unknown;
  reset: boolean;
  segments: unknown[];
};
export class AsrFailure extends Error {
  trace: SeekTrace[];
  constructor(error: unknown, trace: SeekTrace[]) {
    super(error instanceof Error ? error.message : String(error));
    this.trace = trace;
  }
}
/** ASR has no lyric/prompt/reference input. Only generated ASR history is used. */
export async function transcribe<C>(
  runtime: AsrRuntime<C>,
  audio: Float32Array,
  status: (s: string) => void = () => {},
  decode: (
    r: DecodeRuntime<C>,
    p: number[],
    o: Options,
  ) => Promise<Decoded> = search,
  onTrace: (trace: SeekTrace[]) => void = () => {},
) {
  const trace: SeekTrace[] = [],
    history: number[] = [],
    segments = [];
  let seek = 0,
    resetSince = 0,
    lastSpeech = 0;
  try {
    status("全曲特徵");
    const features = await runtime.features(audio),
      contentFrames = features.frames - 1;
    const rules = runtime.rules(),
      sot = runtime.token("<|startoftranscript|>"),
      prev = runtime.token("<|startofprev|>");
    while (seek < contentFrames) {
      const size = Math.min(3000, contentFrames - seek),
        prompt = makePrompt(history, resetSince, sot, prev);
      const entry: SeekTrace = {
        seek,
        size,
        prompt,
        previousTokenRange: [
          Math.max(resetSince, history.length - 223),
          history.length,
        ],
        resetSince,
        attempts: [],
        selected: 0,
        temperature: 0,
        skip: false,
        nextSeek: seek,
        rawSegments: [],
        alignment: null,
        reset: false,
        segments: [],
      };
      trace.push(entry);
      onTrace(trace);
      status(`seek ${(seek / 100).toFixed(2)}s：encode`);
      await runtime.encode(features, seek);
      let accepted = false;
      for (const temperature of TEMPERATURES) {
        const result = await decode(runtime, prompt, {
          eos: rules.eos,
          beam: 5,
          maxSteps: generationBudget(prompt.length),
          temperature,
          mask: (x, t) => maskLogits(x, t, rules),
          noSpeech: runtime.token("<|nocaptions|>"),
          onStep: (n) =>
            status(
              `seek ${(seek / 100).toFixed(2)}s T=${temperature} step=${n}`,
            ),
        });
        const text = runtime.text(result.tokens).trim(),
          cr = await compressionRatio(text),
          decision = fallbackDecision({ ...result, compressionRatio: cr });
        entry.attempts.push({
          ...result,
          temperature,
          text,
          compressionRatio: cr,
          ...decision,
        });
        onTrace(trace);
        if (!decision.retry) {
          entry.selected = entry.attempts.length - 1;
          entry.temperature = temperature;
          accepted = true;
          break;
        }
      }
      if (!accepted) {
        const selected = selectFallback(entry.attempts);
        entry.selected = selected.index;
        entry.temperature = selected.temperature;
      }
      const selected = entry.attempts[entry.selected];
      entry.skip = fallbackDecision(selected).skip;
      if (entry.skip) {
        entry.nextSeek = seek + size;
        seek = entry.nextSeek;
        onTrace(trace);
        await runtime.clearWindow();
        continue;
      }
      const split = splitTimestamps(
        selected.tokens,
        rules.timestamp,
        seek,
        size,
      );
      entry.rawSegments = structuredClone(split.segments);
      const textTokens = split.segments.flatMap((s) =>
        s.tokens.filter((t) => t < rules.eos),
      );
      const alignment = await runtime.align(textTokens, size);
      entry.alignment = alignment;
      const timed = attachWords(
        split.segments,
        alignment.words,
        rules.eos,
        lastSpeech,
      );
      const last =
        timed
          .filter((s) => s.words.length)
          .at(-1)
          ?.words.at(-1)?.end ??
        timed.at(-1)?.end ??
        null;
      entry.nextSeek = nextSeek(seek, split, last);
      if (last !== null) lastSpeech = last;
      const formed = timed.flatMap((s) => {
        const text = runtime.text(s.tokens);
        if (s.start === s.end || !text.trim()) return [];
        history.push(...s.tokens);
        return [
          {
            ...s,
            text: text.trim(),
            temperature: entry.temperature,
            avgLogprob: selected.avgLogprob,
            compressionRatio: selected.compressionRatio,
            noSpeech: selected.noSpeech,
          },
        ];
      });
      entry.segments = formed;
      segments.push(...formed);
      if (entry.temperature > 0.5) {
        resetSince = history.length;
        entry.reset = true;
      }
      onTrace(trace);
      seek = entry.nextSeek;
      await runtime.clearWindow();
    }
    return {
      engine: "upstream-port-v1" as const,
      pcmSha256: Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", audio.slice().buffer),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join(""),
      tokenRules: rules,
      text: segments.map((s) => s.text).join(" "),
      segments,
      trace,
      contentFrames,
      history,
    };
  } catch (error) {
    throw new AsrFailure(error, trace);
  } finally {
    await runtime.clearWindow();
  }
}
