import { roundEven } from "../segment-alignment.ts";
import { deflate } from "pako";
// faster-whisper 1.2.1 transcribe.py: generate_with_fallback/get_prompt/
// _split_segments_by_timestamps/generate_segments. Fixed no-vad/default options.
export const TEMPERATURES = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;
export type Metrics = {
  avgLogprob: number;
  compressionRatio: number;
  noSpeech: number;
};
export function fallbackDecision(m: Metrics) {
  const silence = m.noSpeech > 0.6 && m.avgLogprob < -1;
  return {
    retry: !silence && (m.compressionRatio > 2.4 || m.avgLogprob < -1),
    skip: m.noSpeech > 0.6 && !(m.avgLogprob > -1),
  };
}
export function selectFallback(
  attempts: {
    avgLogprob: number;
    compressionRatio: number;
    temperature: number;
  }[],
) {
  const eligible = attempts
    .map((a, index) => ({ ...a, index }))
    .filter((a) => a.compressionRatio <= 2.4);
  const pool = eligible.length
    ? eligible
    : attempts.map((a, index) => ({ ...a, index }));
  const best = pool.reduce((a, b) => (b.avgLogprob > a.avgLogprob ? b : a));
  return { index: best.index, temperature: attempts.at(-1)!.temperature };
}
export function makePrompt(
  history: number[],
  resetSince: number,
  sot: number,
  sotPrev: number,
) {
  const prev = history.slice(resetSince).slice(-223);
  return [...(prev.length ? [sotPrev, ...prev] : []), sot];
}
export type TokenSegment = {
  seek: number;
  start: number;
  end: number;
  tokens: number[];
};
export function splitTimestamps(
  tokens: number[],
  timestamp: number,
  seek: number,
  size: number,
) {
  const offset = seek / 100;
  const singleEnding =
    tokens.length >= 2 &&
    tokens.at(-2)! < timestamp &&
    tokens.at(-1)! >= timestamp;
  const cuts = tokens.flatMap((t, i) =>
    i > 0 && t >= timestamp && tokens[i - 1] >= timestamp ? [i] : [],
  );
  const segments: TokenSegment[] = [];
  let next = seek + size;
  if (cuts.length) {
    if (singleEnding) cuts.push(tokens.length);
    let last = 0;
    for (const cut of cuts) {
      const ts = tokens.slice(last, cut);
      segments.push({
        seek,
        start: offset + (ts[0] - timestamp) * 0.02,
        end: offset + (ts.at(-1)! - timestamp) * 0.02,
        tokens: ts,
      });
      last = cut;
    }
    if (!singleEnding) next = seek + (tokens[last - 1] - timestamp) * 2;
  } else {
    const timestamps = tokens.filter((t) => t >= timestamp);
    const duration =
      timestamps.length && timestamps.at(-1) !== timestamp
        ? (timestamps.at(-1)! - timestamp) * 0.02
        : size / 100;
    segments.push({
      seek,
      start: offset,
      end: offset + duration,
      tokens: [...tokens],
    });
  }
  return { segments, seek: next, singleEnding };
}
export function nextSeek(
  previous: number,
  split: { seek: number; singleEnding: boolean },
  lastWordEnd: number | null,
) {
  const next =
    !split.singleEnding && lastWordEnd !== null && lastWordEnd > previous / 100
      ? roundEven(lastWordEnd * 100)
      : split.seek;
  if (next <= previous)
    throw Error(`ASR seek made no progress: ${previous} → ${next}`);
  return next;
}
export async function compressionRatio(text: string): Promise<number> {
  const bytes = new TextEncoder().encode(text.trim());
  // Node/Chromium use a patched hash with different compressed lengths.
  // Explicit canonical zlib hash is required for upstream fallback thresholds.
  return (
    bytes.length /
    deflate(bytes, {
      level: 6,
      windowBits: 15,
      memLevel: 8,
      strategy: 0,
      legacyHash: true,
    }).length
  );
}
