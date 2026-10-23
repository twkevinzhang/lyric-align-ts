import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { compareTensor } from './compare.mjs';
import { firstDivergence } from './trace-analysis.mjs';

const local = resolve(import.meta.dirname, '../../.local/whisper-poc');
const json = async path => JSON.parse(await readFile(path));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const lockBytes = await readFile(resolve(import.meta.dirname, 'lock.json'));
const lock = JSON.parse(lockBytes);
const inputs = await json(resolve(local, 'inputs.json'));
assert.equal(inputs.lockSha256, sha(lockBytes));
assert.equal(inputs.modelSha256, lock.model.sha256);
assert.equal(inputs.melSha256, sha(await readFile(resolve(local, 'mel.f32'))));
const runs = {};
for (const [label, kind, pointer] of [
  ['native', 'native', 'latest-native-trace.txt'], ['browser', 'browser', 'latest-browser-trace.txt'],
  ['nativeBaseline', 'native', 'latest-native.txt'], ['browserBaseline', 'browser', 'latest-browser.txt'],
]) {
  const id = (await readFile(resolve(local, pointer), 'utf8')).trim();
  assert.match(id, /^[a-f0-9-]+$/);
  const dir = resolve(local, kind, id);
  const metadata = await json(resolve(dir, 'run.json'));
  for (const key of Object.keys(inputs)) assert.deepEqual(metadata[key], inputs[key], `${label}: ${key}`);
  runs[label] = { id, dir, metadata };
}
assert.deepEqual(runs.native.metadata.instrumentation, runs.browser.metadata.instrumentation);
assert.ok(runs.native.metadata.instrumentation?.instrumentedSha256);
assert.equal(runs.browser.metadata.crossOriginIsolated, true);
const nativeTrace = await json(resolve(runs.native.dir, 'trace.json'));
const browserTrace = await json(resolve(runs.browser.dir, 'trace.json'));
assert.deepEqual(nativeTrace, browserTrace, 'Capture order, shape, dtype and operation must match');
const names = nativeTrace.map(x => x.name);
assert.equal(new Set(names).size, names.length, 'No duplicate tensor captures');
for (const name of ['trace-mel', 'trace-conv1-matmul', 'trace-conv1-bias', 'trace-conv1-gelu',
  'trace-conv2-matmul', 'trace-conv2-bias', 'trace-conv2-gelu', 'trace-position', 'trace-encoder-output',
  ...Array.from({length: 12}, (_, i) => `trace-block-${String(i).padStart(2, '0')}`)]) assert.ok(names.includes(name), `Missing ${name}`);

async function tensor(dir, record) {
  const bytes = await readFile(resolve(dir, `${record.name}.f32`));
  assert.equal(bytes.length, record.dims.reduce((a,b) => a*b, 1) * 4);
  const values = new Float32Array(bytes.length / 4);
  for (let i = 0; i < values.length; i++) values[i] = bytes.readFloatLE(i*4);
  return { dims: record.dims, values, sha256: sha(bytes) };
}
async function compareRecord(record) {
  const a = await tensor(runs.native.dir, record);
  const b = await tensor(runs.browser.dir, record);
  const result = compareTensor(a, b, lock.tolerance);
  return { ...record, ...result, exceedFraction: result.exceedCount / result.count,
    worstNative: a.values[result.worstIndex], worstBrowser: b.values[result.worstIndex],
    nativeSha256: a.sha256, browserSha256: b.sha256 };
}
// Answer the encoder-output question first, then locate the earliest observed deviation.
const encoderOutput = await compareRecord(nativeTrace.find(x => x.name === 'trace-encoder-output'));
const comparisons = [];
for (const record of nativeTrace) comparisons.push(record.name === encoderOutput.name ? encoderOutput : await compareRecord(record));

const nonInterference = [];
for (const kind of ['native', 'browser']) for (const step of lock.steps) for (const suffix of ['logits', 'qk']) {
  const file = `${step.name}.${suffix}.f32`;
  const baseline = sha(await readFile(resolve(runs[`${kind}Baseline`].dir, file)));
  const traced = sha(await readFile(resolve(runs[kind].dir, file)));
  nonInterference.push({ kind, file, bitExact: baseline === traced, baselineSha256: baseline, traceSha256: traced });
}
const report = { schema: 1, createdAt: new Date().toISOString(), lock, inputs,
  runs: Object.fromEntries(Object.entries(runs).map(([key, run]) => [key, { id: run.id, ...run.metadata }])),
  instrumentationPreservedOutputs: nonInterference.every(x => x.bitExact), nonInterference,
  encoderOutput, firstDivergence: firstDivergence(comparisons), comparisons };
await writeFile(resolve(local, 'trace-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Instrumentation preserved baseline logits/QK: ${report.instrumentationPreservedOutputs}`);
console.table(comparisons.map(({ name, pass, maxAbs, rmse, exceedCount, exceedFraction }) => ({ name, pass, maxAbs, rmse, exceedCount, exceedFraction })));
console.log(`Encoder: ${encoderOutput.pass ? 'PASS' : 'FAIL'}; First observed failure: ${report.firstDivergence?.name || 'none'}`);
if (!report.instrumentationPreservedOutputs || report.firstDivergence) process.exitCode = 1;
