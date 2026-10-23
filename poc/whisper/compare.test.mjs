import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTensor } from './compare.mjs';

const tensor = (dims, values) => ({ dims, values });
const tolerance = { atol: 0.001, rtol: 0.001 };

test('rejects axis swaps even when element counts agree', () => {
  assert.equal(compareTensor(tensor([2, 1], [1, 2]), tensor([1, 2], [1, 2]), tolerance).pass, false);
});
test('rejects empty, truncated and non-finite tensors', () => {
  for (const bad of [tensor([0], []), tensor([2], [1]), tensor([1], [NaN]), tensor([1], [Infinity])]) {
    assert.equal(compareTensor(bad, bad, tolerance).pass, false);
  }
});
test('uses elementwise absolute plus relative tolerance, including near zero', () => {
  const ref = tensor([3], [0, 1, 10]);
  assert.equal(compareTensor(ref, tensor([3], [0.0005, 1.0015, 10.01]), tolerance).pass, true);
  const bad = compareTensor(ref, tensor([3], [0.002, 1, 10]), tolerance);
  assert.equal(bad.pass, false);
  assert.equal(bad.exceedCount, 1);
  assert.equal(bad.worstIndex, 0);
});
test('reports actual errors rather than treating same argmax as equality', () => {
  const result = compareTensor(tensor([2], [1, 4]), tensor([2], [2, 4]), tolerance);
  assert.equal(result.pass, false);
  assert.equal(result.maxAbs, 1);
  assert.equal(result.meanAbs, 0.5);
  assert.equal(result.rmse, Math.sqrt(0.5));
});
