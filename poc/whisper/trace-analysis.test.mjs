import test from 'node:test';
import assert from 'node:assert/strict';
import { firstDivergence } from './trace-analysis.mjs';

test('finds the first execution-order failure, not the largest later error', () => {
  const records = [{ name: 'conv', pass: true }, { name: 'block0', pass: false, maxAbs: 0.002 }, { name: 'output', pass: false, maxAbs: 1 }];
  assert.equal(firstDivergence(records)?.name, 'block0');
});
test('missing and invalid captures cannot be reported as passing', () => {
  assert.throws(() => firstDivergence([]));
  assert.throws(() => firstDivergence([{ name: 'output' }]));
});
test('returns no divergence only when every capture passed', () => {
  assert.equal(firstDivergence([{ name: 'output', pass: true }]), null);
});
