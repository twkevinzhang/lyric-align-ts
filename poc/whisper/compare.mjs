export function compareTensor(reference, candidate, tolerance) {
  const valid = ({ dims, values }) => Array.isArray(dims) && dims.length > 0 &&
    dims.every(d => Number.isSafeInteger(d) && d > 0) &&
    dims.reduce((a, b) => a * b, 1) === values.length;
  if (!valid(reference) || !valid(candidate)) return { pass: false, reason: 'invalid tensor length/dimensions' };
  if (JSON.stringify(reference.dims) !== JSON.stringify(candidate.dims)) return { pass: false, reason: 'dimension mismatch' };
  if (![tolerance.atol, tolerance.rtol].every(x => Number.isFinite(x) && x >= 0)) throw new Error('Invalid tolerance');
  let maxAbs = 0, sumAbs = 0, sumSquares = 0, exceedCount = 0, worstIndex = 0;
  for (let i = 0; i < reference.values.length; i++) {
    const a = reference.values[i], b = candidate.values[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { pass: false, reason: 'non-finite value', index: i };
    const error = Math.abs(a - b);
    if (error > maxAbs) { maxAbs = error; worstIndex = i; }
    sumAbs += error;
    sumSquares += error * error;
    if (error > tolerance.atol + tolerance.rtol * Math.abs(a)) exceedCount++;
  }
  return { pass: exceedCount === 0, count: reference.values.length, maxAbs,
    meanAbs: sumAbs / reference.values.length, rmse: Math.sqrt(sumSquares / reference.values.length),
    exceedCount, worstIndex };
}
