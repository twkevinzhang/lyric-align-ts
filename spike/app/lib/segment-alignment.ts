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

/** Upstream align(..., pairing=1, window=4, karaoke=False), no interpolation. */
export function alignSegments(segments: Segment[], lyrics: string[]) {
  const chars = normalize(lyrics.join("\n"));
  const cjk = chars.filter((c) =>
    /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/u.test(
      c,
    ),
  ).length;
  const threshold = chars.length && cjk / chars.length >= 0.2 ? 0.25 : 0.5;
  let cursor = 0;
  return lyrics.map((line) => {
    let score = 0,
      best: number | null = null;
    for (let i = cursor; i < Math.min(cursor + 4, segments.length); i++) {
      const candidate = similarity(line, segments[i].text);
      if (candidate > score) {
        score = candidate;
        best = i;
      }
    }
    const matched = best !== null && score > threshold;
    if (matched) cursor = best! + 1;
    return {
      line,
      start: matched ? segments[best!].start : null,
      end: matched ? segments[best!].end : null,
      score,
      matched,
      segmentIndex: matched ? best : null,
    };
  });
}
