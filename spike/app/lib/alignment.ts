// Port of lyric-align's normalize/anchor/breath behavior. See upstream.LICENSE.
// The word-to-segment adapter below is spike-specific, not an upstream algorithm.
import type { TimedWord } from "./protocol";
export type Word = { start: number; end: number; word: string };
export type Segment = {
  start: number;
  end: number;
  text: string;
  words: Word[];
};
export type AlignedLine = {
  line: string;
  start: number | null;
  end: number | null;
  score: number;
  matched: boolean;
};
const normalize = (s: string) =>
  s.replace(/[\s「」『』、。！？!?・,.\-—…]+/gu, "");
const nchars = (s: string) => Array.from(s.replaceAll(" ", "")).length;
const pyRound = (x: number) =>
  x % 1 === 0.5
    ? Math.floor(x / 2) * 2 + (Math.floor(x) % 2 === 0 ? 0 : 2)
    : Math.round(x);

/** SequenceMatcher's non-junk matching blocks, including default autojunk. */
export function similarity(left: string, right: string): number {
  const a = Array.from(normalize(left)),
    b = Array.from(normalize(right));
  const b2j = new Map<string, number[]>();
  b.forEach((c, i) => {
    const list = b2j.get(c) ?? [];
    list.push(i);
    b2j.set(c, list);
  });
  if (b.length >= 200)
    for (const [c, indices] of b2j)
      if (indices.length > Math.floor(b.length / 100) + 1) b2j.delete(c);
  const queue = [[0, a.length, 0, b.length]];
  const blocks: number[][] = [];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    let bi = alo,
      bj = blo,
      size = 0,
      j2len = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const next = new Map<number, number>();
      for (const j of b2j.get(a[i]) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        next.set(j, k);
        if (k > size) {
          bi = i - k + 1;
          bj = j - k + 1;
          size = k;
        }
      }
      j2len = next;
    }
    while (bi > alo && bj > blo && a[bi - 1] === b[bj - 1]) {
      bi--;
      bj--;
      size++;
    }
    while (bi + size < ahi && bj + size < bhi && a[bi + size] === b[bj + size])
      size++;
    if (size) {
      blocks.push([bi, bj, size]);
      if (alo < bi && blo < bj) queue.push([alo, bi, blo, bj]);
      if (bi + size < ahi && bj + size < bhi)
        queue.push([bi + size, ahi, bj + size, bhi]);
    }
  }
  return a.length + b.length
    ? (2 * blocks.reduce((s, block) => s + block[2], 0)) / (a.length + b.length)
    : 1;
}

export function parseLyrics(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s &&
        !s.startsWith("#") &&
        !/^\[[^\]]+\]\s*(?:\([^)]*\)|（[^）]*）)?\s*$/u.test(s),
    );
}

/** Experimental adapter: pause >=0.65 s or span >=14 s starts a new segment. */
export function groupWords(words: TimedWord[]): Segment[] {
  const result: Segment[] = [];
  for (const w of words) {
    if (w.start === null || w.end === null || w.end < w.start) continue;
    const last = result.at(-1);
    if (!last || w.start - last.end >= 0.65 || w.end - last.start > 14) {
      result.push({
        start: w.start,
        end: w.end,
        text: w.text,
        words: [{ start: w.start, end: w.end, word: w.text }],
      });
    } else {
      last.end = w.end;
      last.text += w.text;
      last.words.push({ start: w.start, end: w.end, word: w.text });
    }
  }
  return result;
}

function splitWords(words: Word[], lines: string[]): Word[][] {
  const n = words.length;
  if (lines.length === 1 || n <= 1)
    return [words, ...lines.slice(1).map(() => [])];
  const total = lines.reduce((s, line) => s + nchars(line), 0) || 1;
  const groups: Word[][] = [];
  let start = 0,
    cumulative = 0;
  for (let li = 0; li < lines.length - 1; li++) {
    cumulative += nchars(lines[li]);
    const remaining = lines.length - li - 1;
    const target = pyRound((n * cumulative) / total);
    const lo = Math.max(start + 1, target - 3),
      hi = Math.min(n - remaining, target + 4);
    let cut = Math.min(Math.max(lo, start + 1), n - remaining);
    if (hi > lo) {
      let gap = -1;
      cut = lo;
      for (let i = lo; i < hi; i++)
        if (words[i].start - words[i - 1].end > gap) {
          gap = words[i].start - words[i - 1].end;
          cut = i;
        }
    }
    groups.push(words.slice(start, cut));
    start = cut;
  }
  groups.push(words.slice(start));
  return groups;
}

export function align(
  segments: Segment[],
  lyrics: string[],
  pairing: number | "auto" = "auto",
): AlignedLine[] {
  const size =
    pairing === "auto"
      ? Math.max(
          1,
          Math.min(
            3,
            segments.length ? pyRound(lyrics.length / segments.length) : 1,
          ),
        )
      : Math.max(1, pairing);
  const normalized = normalize(lyrics.join(""));
  const cjk = Array.from(normalized).filter((c) =>
    /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/u.test(
      c,
    ),
  ).length;
  const threshold =
    normalized.length && cjk / Array.from(normalized).length >= 0.2
      ? 0.25
      : 0.5;
  const result: AlignedLine[] = [];
  let idx = 0;
  for (let pos = 0; pos < lyrics.length; pos += size) {
    const unit = lyrics.slice(pos, pos + size);
    let bestScore = 0,
      bestIndex = -1;
    for (let i = idx; i < Math.min(idx + 4, segments.length); i++) {
      const score = similarity(unit.join(" "), segments[i].text);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0 && bestScore > threshold) {
      const seg = segments[bestIndex];
      idx = bestIndex + 1;
      const groups =
        unit.length > 1 && seg.words.length
          ? splitWords(seg.words, unit)
          : null;
      unit.forEach((line, i) => {
        const grp = groups?.[i];
        result.push({
          line,
          start: grp?.length ? grp[0].start : seg.start,
          end: grp?.length ? grp.at(-1)!.end : seg.end,
          score: bestScore,
          matched: true,
        });
      });
    } else
      unit.forEach((line) =>
        result.push({
          line,
          start: null,
          end: null,
          score: bestScore,
          matched: false,
        }),
      );
  }
  return result;
}
