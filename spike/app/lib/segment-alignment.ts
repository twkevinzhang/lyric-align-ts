export type Segment = {
  start: number | null;
  end: number | null;
  text: string;
  words?: { start: number; end: number; word: string }[];
};

// Python re \s, followed by the upstream punctuation set. Preserve case.
/* eslint-disable no-control-regex -- Match Python whitespace, including U+001C–U+001F. */
const strip =
  /[\t-\r\x1c-\x20\x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000「」『』、。！？!?・,.\-—…]+/gu;
/* eslint-enable no-control-regex */
const normalize = (text: string) => Array.from(text.replace(strip, ""));

/** difflib.SequenceMatcher(None, a, b).ratio(), including default autojunk. */
export function similarity(left: string, right: string): number {
  const a = normalize(left),
    b = normalize(right);
  if (!a.length && !b.length) return 1;
  const positions = new Map<string, number[]>();
  b.forEach((char, i) => {
    const indices = positions.get(char) ?? [];
    indices.push(i);
    positions.set(char, indices);
  });
  if (b.length >= 200) {
    const limit = Math.floor(b.length / 100) + 1;
    for (const [char, indices] of positions)
      if (indices.length > limit) positions.delete(char);
  }
  const queue = [[0, a.length, 0, b.length]];
  let matches = 0;
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    let ai = alo,
      bj = blo,
      size = 0;
    let previous = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const current = new Map<number, number>();
      for (const j of positions.get(a[i]) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const length = (previous.get(j - 1) ?? 0) + 1;
        current.set(j, length);
        if (length > size) {
          ai = i - length + 1;
          bj = j - length + 1;
          size = length;
        }
      }
      previous = current;
    }
    // Popular characters cannot seed a match, but can extend one (no isjunk).
    while (ai > alo && bj > blo && a[ai - 1] === b[bj - 1]) {
      ai--;
      bj--;
      size++;
    }
    while (ai + size < ahi && bj + size < bhi && a[ai + size] === b[bj + size])
      size++;
    if (!size) continue;
    matches += size;
    if (alo < ai && blo < bj) queue.push([alo, ai, blo, bj]);
    if (ai + size < ahi && bj + size < bhi)
      queue.push([ai + size, ahi, bj + size, bhi]);
  }
  return (2 * matches) / (a.length + b.length);
}

/** Python round(), including ties-to-even (positive ratios). */
export function roundEven(n: number): number {
  const lo = Math.floor(n),
    fraction = n - lo;
  return fraction === 0.5 ? lo + (lo % 2) : Math.round(n);
}
export function autoPairing(lyrics: string[], segments: Segment[]): number {
  return segments.length
    ? Math.max(1, Math.min(3, roundEven(lyrics.length / segments.length)))
    : 1;
}
type Word = NonNullable<Segment["words"]>[number];
/** lyric-align breath.py: nchars strips ASCII spaces only, not punctuation. */
export function splitWordsByBreath(
  words: Word[],
  lines: string[],
  search = 3,
): Word[][] {
  const n = words.length;
  if (!lines.length) return [];
  if (lines.length === 1 || n <= 1)
    return [words, ...lines.slice(1).map(() => [])];
  const counts = lines.map((l) => Array.from(l.replaceAll(" ", "")).length);
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const groups: Word[][] = [];
  let start = 0,
    cumulative = 0;
  for (let li = 0; li < lines.length - 1; li++) {
    cumulative += counts[li];
    const remaining = lines.length - li - 1;
    const target = roundEven((n * cumulative) / total);
    const lo = Math.max(start + 1, target - search),
      hi = Math.min(n - remaining, target + search + 1);
    let cut = lo,
      gap = -1;
    if (hi <= lo) cut = Math.min(Math.max(lo, start + 1), n - remaining);
    else
      for (let i = lo; i < hi; i++) {
        const g = words[i].start - words[i - 1].end;
        if (g > gap) {
          gap = g;
          cut = i;
        }
      }
    groups.push(words.slice(start, cut));
    start = cut;
  }
  groups.push(words.slice(start));
  return groups;
}

/** Upstream default auto/window=4, karaoke=False, no interpolation. */
export function alignSegments(
  segments: Segment[],
  lyrics: string[],
  requested: number | "auto" = "auto",
) {
  const pairing =
    requested === "auto"
      ? autoPairing(lyrics, segments)
      : Math.max(1, requested);
  const chars = normalize(lyrics.join("\n"));
  const cjk = chars.filter((c) =>
    /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/u.test(
      c,
    ),
  ).length;
  const threshold = chars.length && cjk / chars.length >= 0.2 ? 0.25 : 0.5;
  let cursor = 0;
  const results = [];
  for (let offset = 0; offset < lyrics.length; offset += pairing) {
    const unit = lyrics.slice(offset, offset + pairing),
      line = unit.join(" ");
    const searchStart = cursor,
      candidates: { segmentIndex: number; score: number }[] = [];
    let score = 0,
      best: number | null = null;
    for (let i = cursor; i < Math.min(cursor + 4, segments.length); i++) {
      const candidate = similarity(line, segments[i].text);
      candidates.push({ segmentIndex: i, score: candidate });
      if (candidate > score) {
        score = candidate;
        best = i;
      }
    }
    const matched = best !== null && score > threshold;
    if (matched) cursor = best! + 1;
    const seg = matched ? segments[best!] : null;
    const groups =
      seg?.words?.length && unit.length > 1
        ? splitWordsByBreath(seg.words, unit)
        : [];
    for (let k = 0; k < unit.length; k++) {
      const group = groups[k];
      results.push({
        line: unit[k],
        start: seg ? (group?.length ? group[0].start : seg.start) : null,
        end: seg ? (group?.length ? group.at(-1)!.end : seg.end) : null,
        score,
        matched,
        segmentIndex: matched ? best : null,
        pairing,
        groupLines: [offset, offset + unit.length],
        searchStart,
        candidates,
        wordIndices: group?.map((w) => seg!.words!.indexOf(w)) ?? [],
      });
    }
  }
  return results;
}
