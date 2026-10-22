/** CPython round(x, ndigits): round the exact IEEE-754 value, half-even. */
export function pythonRound(x: number, digits: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(x));
  const bits = view.getBigUint64(0),
    exponent = Number((bits >> 52n) & 2047n);
  const mantissa = (bits & ((1n << 52n) - 1n)) + (exponent ? 1n << 52n : 0n);
  const power = (exponent ? exponent - 1023 : 1 - 1023) - 52;
  let numerator = mantissa * 10n ** BigInt(digits),
    denominator = 1n;
  if (power >= 0) numerator <<= BigInt(power);
  else denominator <<= BigInt(-power);
  let q = numerator / denominator;
  const remainder = numerator % denominator;
  if (
    remainder * 2n > denominator ||
    (remainder * 2n === denominator && q % 2n === 1n)
  )
    q++;
  return (Math.sign(x) * Number(q)) / 10 ** digits;
}
