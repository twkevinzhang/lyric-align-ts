import type { Segment } from "./alignment";
import type { TimedWord } from "./protocol";

/** Diagnostic association by word start, without reference timings or inferred spans. */
export function nativeSegments(chunks: unknown, words: TimedWord[]) {
  if (!Array.isArray(chunks))
    throw new Error("Native segment output is unavailable");
  const segments: Segment[] = [];
  const rejectedChunks: number[] = [];
  chunks.forEach((chunk: { text?: unknown; timestamp?: unknown }, index) => {
    const t = Array.isArray(chunk?.timestamp) ? chunk.timestamp : [];
    if (
      typeof chunk?.text !== "string" ||
      typeof t[0] !== "number" ||
      typeof t[1] !== "number" ||
      !Number.isFinite(t[0]) ||
      !Number.isFinite(t[1]) ||
      t[0] < 0 ||
      t[1] <= t[0]
    ) {
      rejectedChunks.push(index);
      return;
    }
    segments.push({ start: t[0], end: t[1], text: chunk.text, words: [] });
  });
  const unassignedWords: number[] = [];
  words.forEach((word, index) => {
    const segment =
      word.start === null
        ? undefined
        : segments.find(
            (s, i) =>
              word.start! >= s.start &&
              (word.start! < s.end ||
                (i === segments.length - 1 && word.start === s.end)),
          );
    if (
      !segment ||
      word.start === null ||
      word.end === null ||
      word.end < word.start
    ) {
      unassignedWords.push(index);
      return;
    }
    segment.words.push({ start: word.start, end: word.end, word: word.text });
  });
  return { segments, rejectedChunks, unassignedWords };
}
