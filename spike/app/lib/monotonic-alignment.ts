type Word = { text: string; start: number | null; end: number | null };
const tokenize = (text: string) =>
  text
    .toLowerCase()
    .replaceAll("’", "'")
    .match(/[a-z]+(?:'[a-z]+)*/g) ?? [];

/** Experimental English text-only mapping. No reference times or guessed starts. */
export function alignMonotonic(words: Word[], lyrics: string[]) {
  const hypothesis = words.flatMap((w) =>
    tokenize(w.text).map((text) => ({ ...w, text })),
  );
  const reference = lyrics.flatMap((line, lineIndex) =>
    tokenize(line).map((text) => ({ text, lineIndex })),
  );
  const n = reference.length,
    m = hypothesis.length;
  const costs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = 0; i <= n; i++) costs[i][0] = i;
  for (let j = 0; j <= m; j++) costs[0][j] = j;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      costs[i][j] = Math.min(
        costs[i - 1][j - 1] +
          Number(reference[i - 1].text !== hypothesis[j - 1].text),
        costs[i - 1][j] + 1,
        costs[i][j - 1] + 1,
      );
  const mapping = new Map<number, number>();
  let i = n,
    j = m;
  while (i || j) {
    if (
      i &&
      j &&
      costs[i][j] ===
        costs[i - 1][j - 1] +
          Number(reference[i - 1].text !== hypothesis[j - 1].text)
    ) {
      if (reference[i - 1].text === hypothesis[j - 1].text)
        mapping.set(i - 1, j - 1);
      i--;
      j--;
    } else if (i && costs[i][j] === costs[i - 1][j] + 1) i--;
    else j--;
  }
  let previousStart = -Infinity;
  return lyrics.map((line, lineIndex) => {
    const indices = reference
      .map((w, k) => (w.lineIndex === lineIndex ? k : -1))
      .filter((k) => k >= 0);
    const hits = indices
      .map((k) => mapping.get(k))
      .filter((k): k is number => k !== undefined);
    const first = mapping.get(indices[0]),
      second = mapping.get(indices[1]);
    const onset = first === undefined ? null : hypothesis[first].start;
    const coverage = indices.length ? hits.length / indices.length : 0;
    const matched =
      first !== undefined &&
      second === first + 1 &&
      coverage >= 0.5 &&
      onset !== null &&
      hypothesis[first].end !== null &&
      hypothesis[first].end! > onset &&
      onset >= previousStart;
    if (matched) previousStart = onset;
    const end = hits.length ? hypothesis[hits.at(-1)!].end : null;
    return {
      line,
      matched,
      start: matched ? onset : null,
      end: matched && end !== null && end > onset! ? end : null,
      score: coverage,
      coverage,
    };
  });
}
