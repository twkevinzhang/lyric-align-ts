import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { compareTensor } from './compare.mjs';

const local = resolve(import.meta.dirname, '../../.local/whisper-poc');
const lockBytes = await readFile(resolve(import.meta.dirname, 'lock.json'));
const lock = JSON.parse(lockBytes);
const sha = data => createHash('sha256').update(data).digest('hex');
const json = async path => JSON.parse(await readFile(path));
const portable = process.argv.includes('--portable');
const nativeId = (await readFile(resolve(local, portable ? 'latest-native-portable.txt' : 'latest-native.txt'), 'utf8')).trim();
const browserId = (await readFile(resolve(local, 'latest-browser.txt'), 'utf8')).trim();
const nativeDir = resolve(local, 'native', nativeId);
const browserDir = resolve(local, 'browser', browserId);
const native = await json(resolve(nativeDir, 'run.json'));
const browser = await json(resolve(browserDir, 'run.json'));
const inputs = await json(resolve(local, 'inputs.json'));
assert.equal(inputs.lockSha256, sha(lockBytes), 'Current lock differs from fixture');
assert.equal(inputs.modelSha256, lock.model.sha256);
assert.equal(inputs.modelSha256, sha(await readFile(resolve(local, lock.model.file))));
assert.equal(inputs.melSha256, sha(await readFile(resolve(local, 'mel.f32'))));
assert.equal(inputs.stepsSha256, sha(await readFile(resolve(local, 'steps.txt'))));
for (const run of [native, browser]) for (const key of Object.keys(inputs)) assert.deepEqual(run[key], inputs[key], `Run provenance mismatch: ${key}`);
assert.equal(native.runtime, 'linux-x64-native-docker');
assert.equal(browser.runtime, 'browser-wasm');
assert.equal(browser.crossOriginIsolated, true);
const a = await json(resolve(nativeDir, 'tensors.json'));
const b = await json(resolve(browserDir, 'tensors.json'));
assert.equal(a.length, lock.steps.length);
assert.equal(b.length, lock.steps.length);
const comparisons = [];
const readTensor = async (dir, name, dims) => {
  const bytes = await readFile(resolve(dir, name));
  assert.equal(bytes.length % 4, 0, 'Truncated float32 file');
  const values = new Float32Array(bytes.length / 4);
  for (let i = 0; i < values.length; i++) values[i] = bytes.readFloatLE(i * 4);
  return { dims, values, sha256: sha(bytes) };
};
for (let i = 0; i < lock.steps.length; i++) {
  const step = lock.steps[i];
  for (const record of [a[i], b[i]]) {
    for (const key of ['name', 'tokens', 'nPast']) assert.deepEqual(record[key], step[key], `Step ${i} ${key}`);
    assert.deepEqual(record.logitsDims, [51865], 'Multilingual small vocabulary');
    assert.deepEqual(record.qkDims, [10, step.tokens.length, 1500], 'small preset QK [heads,tokens,frames]');
  }
  for (const kind of ['logits', 'qk']) {
    const name = `${step.name}.${kind}.f32`;
    const x = await readTensor(nativeDir, name, a[i][`${kind}Dims`]);
    const y = await readTensor(browserDir, name, b[i][`${kind}Dims`]);
    comparisons.push({ step: step.name, kind, dims: x.dims, nativeSha256: x.sha256, browserSha256: y.sha256,
      ...compareTensor(x, y, lock.tolerance) });
  }
}
const report = { schema: 1, createdAt: new Date().toISOString(), pass: comparisons.every(x => x.pass),
  scope: 'Synthetic Mel, forced tokens; no ASR/timing quality claim', tolerance: lock.tolerance,
  lock, native, browser, comparisons };
const reportPath = resolve(local, portable ? 'report-portable.json' : 'report.json');
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.table(comparisons.map(({ step, kind, dims, pass, maxAbs, rmse, exceedCount }) => ({ step, kind, dims: dims.join('x'), pass, maxAbs, rmse, exceedCount })));
console.log(`Overall: ${report.pass ? 'PASS' : 'FAIL'}; ${reportPath}`);
if (!report.pass) process.exitCode = 1;
