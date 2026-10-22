const tokenize = (text: string) =>
  text
    .toLowerCase()
    .replaceAll("’", "'")
    .match(/[a-z]+(?:'[a-z]+)*/g) ?? [];
export function wordErrors(reference: string, hypothesis: string) {
  const a = tokenize(reference),
    b = tokenize(hypothesis);
  if (!a.length) throw new Error("English WER requires a nonempty reference");
  type Cell = {
    cost: number;
    substitutions: number;
    deletions: number;
    insertions: number;
  };
  const d: Cell[][] = Array.from({ length: a.length + 1 }, () =>
    Array<Cell>(b.length + 1),
  );
  d[0][0] = { cost: 0, substitutions: 0, deletions: 0, insertions: 0 };
  for (let i = 0; i <= a.length; i++)
    for (let j = 0; j <= b.length; j++) {
      if (!i && !j) continue;
      const options: Cell[] = [];
      if (i && j) {
        const p = d[i - 1][j - 1],
          s = Number(a[i - 1] !== b[j - 1]);
        options.push({
          ...p,
          cost: p.cost + s,
          substitutions: p.substitutions + s,
        });
      }
      if (i) {
        const p = d[i - 1][j];
        options.push({ ...p, cost: p.cost + 1, deletions: p.deletions + 1 });
      }
      if (j) {
        const p = d[i][j - 1];
        options.push({ ...p, cost: p.cost + 1, insertions: p.insertions + 1 });
      }
      d[i][j] = options.sort((x, y) => x.cost - y.cost)[0];
    }
  return {
    ...d[a.length][b.length],
    referenceWords: a.length,
    hypothesisWords: b.length,
    rate: d[a.length][b.length].cost / a.length,
  };
}
