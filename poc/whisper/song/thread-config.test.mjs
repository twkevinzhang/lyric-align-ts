import test from 'node:test';
import assert from 'node:assert/strict';
import {threadConfig,selectThreads} from './thread-config.mjs';
test('one inference owner plus bounded helper pool; thread count is total compute workers',()=>{
  assert.deepEqual(threadConfig('4'),{threads:4,poolSize:6,helpersInCompute:3});
  assert.equal(threadConfig('1').helpersInCompute,0);
});
test('reject invalid counts rather than silently changing benchmark conditions',()=>{
  for(const n of ['0','7','1.5','4x','NaN','']) assert.throws(()=>threadConfig(n));
});
test('uses repeated timings and prefers fewer workers within five percent of fastest',()=>{
  assert.equal(selectThreads([{threads:2,encoderMs:190},{threads:2,encoderMs:210},{threads:4,encoderMs:103},{threads:4,encoderMs:105},{threads:6,encoderMs:98},{threads:6,encoderMs:102}]),4);
  assert.equal(selectThreads([{threads:4,encoderMs:130},{threads:6,encoderMs:100}]),6);
  assert.throws(()=>selectThreads([]));
  assert.throws(()=>selectThreads([{threads:4,encoderMs:NaN}]));
});
