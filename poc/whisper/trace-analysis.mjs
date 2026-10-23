export function firstDivergence(comparisons) {
  if (!comparisons.length || comparisons.some(x => !x.name || typeof x.pass !== 'boolean')) {
    throw new Error('Missing or invalid trace comparisons');
  }
  return comparisons.find(x => !x.pass) ?? null;
}
