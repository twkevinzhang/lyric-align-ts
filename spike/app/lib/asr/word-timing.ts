import type { TokenSegment } from "./control.ts";
import { pythonRound } from "./rounding.ts";
export type TimedWord = {
  word: string;
  tokens: number[];
  start: number;
  end: number;
  probability: number;
};
/** CT2 negative_dtw: strict diagonal/vertical comparisons, horizontal wins ties. */
export function negativeDtw(x: number[][]): number[][] {
  const n = x.length,
    m = x[0]?.length ?? 0;
  if (!n || !m) return [];
  const cost = Array.from({ length: n + 1 }, () =>
    new Float32Array(m + 1).fill(Infinity),
  );
  const trace = Array.from({ length: n + 1 }, () =>
    new Int8Array(m + 1).fill(-1),
  );
  cost[0][0] = 0;
  for (let j = 1; j <= m; j++)
    for (let i = 1; i <= n; i++) {
      const a = cost[i - 1][j - 1],
        b = cost[i - 1][j],
        c = cost[i][j - 1];
      const t = a < b && a < c ? 0 : b < a && b < c ? 1 : 2;
      trace[i][j] = t;
      cost[i][j] = -x[i - 1][j - 1] + (t === 0 ? a : t === 1 ? b : c);
    }
  trace[0].fill(2);
  for (let i = 0; i <= n; i++) trace[i][0] = 1;
  let i = n,
    j = m;
  const result = [];
  while (i > 0 || j > 0) {
    result.push([i - 1, j - 1]);
    const t = trace[i][j];
    if (t === 0) {
      i--;
      j--;
    } else if (t === 1) i--;
    else j--;
  }
  return result.reverse();
}
/** ONNX probabilities are renormalized over valid frames, equivalent to
 * CT2 softmax of cropped QK logits. Never softmax probabilities a second time.
 */
export function alignmentMatrix(
  heads: number[][][],
  frames: number,
  width = 7,
): number[][] {
  if (!heads.length || frames < 1)
    throw Error("Missing valid alignment attention");
  const rows = heads[0].length,
    mean = Array.from({ length: rows }, () => Array(frames).fill(0));
  for (const head of heads) {
    const normalized = head.map((row) => {
      const v = row.slice(0, frames),
        sum = v.reduce((a, b) => a + b, 0);
      if (
        v.length !== frames ||
        v.some((x) => !Number.isFinite(x) || x <= 0) ||
        !(sum > 0)
      )
        throw Error("Attention cannot reconstruct valid-frame softmax");
      return v.map((x) => x / sum);
    });
    for (let f = 0; f < frames; f++) {
      const mu = normalized.reduce((a, row) => a + row[f], 0) / rows;
      const variance =
        normalized.reduce((a, row) => a + (row[f] - mu) ** 2, 0) / rows;
      if (!(variance > 0))
        throw Error(
          "Zero variance attention: CT2 LayerNorm epsilon=0 is undefined",
        );
      for (let r = 0; r < rows; r++)
        normalized[r][f] = Math.fround(
          (normalized[r][f] - mu) / Math.sqrt(variance),
        );
    }
    const rank = Math.floor(width / 2);
    for (let r = 0; r < rows; r++)
      for (let f = 0; f < frames; f++) {
        let value = normalized[r][f];
        if (frames > rank) {
          const window = [];
          for (let k = -rank; k <= rank; k++) {
            let read = Math.abs(f + k);
            if (read >= frames) read = 2 * frames - read - 2;
            window.push(normalized[r][read]);
          }
          window.sort((a, b) => a - b);
          value = window[rank];
        }
        mean[r][f] += value / heads.length;
      }
  }
  return mean;
}
const asciiPunctuation = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
export function splitWordTokens(
  tokens: number[],
  decode: (ids: number[]) => string,
  eos: number,
) {
  const full = Array.from(decode(tokens)),
    subwords: { word: string; tokens: number[] }[] = [];
  let pending: number[] = [],
    offset = 0;
  for (const token of tokens) {
    pending.push(token);
    const text = decode(pending),
      chars = Array.from(text),
      replacement = chars.indexOf("\ufffd");
    if (replacement < 0 || full[offset + replacement] === "\ufffd") {
      subwords.push({ word: text, tokens: pending });
      pending = [];
      offset += chars.length;
    }
  }
  const result: { word: string; tokens: number[] }[] = [];
  for (const s of subwords) {
    const special = s.tokens[0] >= eos,
      punctuation = asciiPunctuation.includes(s.word.trim());
    if (special || s.word.startsWith(" ") || punctuation || !result.length)
      result.push(s);
    else {
      result.at(-1)!.word += s.word;
      result.at(-1)!.tokens.push(...s.tokens);
    }
  }
  return result;
}
const prepend = "\"'“¿([{-",
  append = "\"'.。,，!！?？:：”)]}、";
function mergePunctuation(words: TimedWord[]) {
  let j = words.length - 1;
  for (let i = words.length - 2; i >= 0; i--) {
    const a = words[i],
      b = words[j];
    if (a.word.startsWith(" ") && prepend.includes(a.word.trim())) {
      b.word = a.word + b.word;
      b.tokens = [...a.tokens, ...b.tokens];
      a.word = "";
      a.tokens = [];
    } else j = i;
  }
  let i = 0;
  for (j = 1; j < words.length; j++) {
    const a = words[i],
      b = words[j];
    if (!a.word.endsWith(" ") && append.includes(b.word)) {
      a.word += b.word;
      a.tokens.push(...b.tokens);
      b.word = "";
      b.tokens = [];
    } else i = j;
  }
}
// Python round(x,2), using decimal half-even at ordinary timestamp precision.
function round2(x: number) {
  return pythonRound(x, 2);
}
/** faster-whisper add_word_timestamps, including its original boundary rules.
 * These operate solely on generated ASR words, never on supplied lyrics.
 */
export function attachWords(
  input: TokenSegment[],
  aligned: TimedWord[],
  eos: number,
  lastSpeech: number,
) {
  const words = aligned.map((w) => ({ ...w, tokens: [...w.tokens] }));
  const durations = words
    .map((w) => w.end - w.start)
    .filter((d) => d !== 0)
    .sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  const median = Math.min(
      0.7,
      durations.length
        ? durations.length % 2
          ? durations[mid]
          : (durations[mid - 1] + durations[mid]) / 2
        : 0,
    ),
    max = 2 * median;
  if (durations.length)
    for (let i = 1; i < words.length; i++)
      if (words[i].end - words[i].start > max) {
        if (".。!！?？".includes(words[i].word))
          words[i].end = words[i].start + max;
        else if (".。!！?？".includes(words[i - 1].word))
          words[i].start = words[i].end - max;
      }
  mergePunctuation(words);
  let index = 0;
  return input.map((s) => {
    let saved = 0;
    const count = s.tokens.filter((t) => t < eos).length;
    const out: Omit<TimedWord, "tokens">[] = [];
    while (index < words.length && saved < count) {
      const w = words[index++];
      if (w.word)
        out.push({
          word: w.word,
          start: round2(s.seek / 100 + w.start),
          end: round2(s.seek / 100 + w.end),
          probability: w.probability,
        });
      saved += w.tokens.length;
    }
    let start = s.start,
      end = s.end;
    if (out.length) {
      const first = out[0],
        second = out[1],
        last = out.at(-1)!;
      if (
        first.end - lastSpeech > median * 4 &&
        (first.end - first.start > max ||
          (second && second.end - first.start > max * 2))
      ) {
        if (second && second.end - second.start > max) {
          const boundary = Math.max(second.end / 2, second.end - max);
          first.end = second.start = boundary;
        }
        first.start = Math.max(0, first.end - max);
      }
      if (start < first.end && start - 0.5 > first.start)
        first.start = Math.max(0, Math.min(first.end - median, start));
      else start = first.start;
      if (end > last.start && end + 0.5 < last.end)
        last.end = Math.max(last.start + median, end);
      else end = last.end;
      lastSpeech = end;
    }
    return { ...s, start, end, words: out };
  });
}
