import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inferenceConfig} from './inference-config.mjs';
test('small remains default; tiny and base are explicit pinned experiments',()=>{
  assert.equal(inferenceConfig({}).model,'small');
  const tiny=inferenceConfig({SONG_MODEL:'tiny',SONG_END_THRESHOLD:'0.5'});
  assert.equal(tiny.heads,6);assert.equal(tiny.endTokenThreshold,0.5);
  assert.equal(tiny.sha256,'818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7');
  assert.equal(inferenceConfig({SONG_MODEL:'base'}).heads,8);
});
test('invalid experimental parameters fail instead of silently changing settings',()=>{
  for(const env of [{SONG_MODEL:'foo'},{SONG_END_THRESHOLD:'NaN'},{SONG_END_THRESHOLD:'1.1'},{SONG_END_THRESHOLD:'-1'}])assert.throws(()=>inferenceConfig(env));
});
test('explicit worker token budget remains within the model context',()=>{
  assert.equal(inferenceConfig({}).workerTokenBudget,220);
  assert.equal(inferenceConfig({SONG_WORKER_TOKEN_BUDGET:'440'}).workerTokenBudget,440);
  for(const value of ['0','445','NaN','1.5'])assert.throws(()=>inferenceConfig({SONG_WORKER_TOKEN_BUDGET:value}));
});
test('tiny F16 is a separately pinned precision experiment',()=>{
  const c=inferenceConfig({SONG_MODEL:'tiny',SONG_MODEL_PRECISION:'f16'});
  assert.equal(c.model,'tiny');assert.equal(c.file,'ggml-tiny.bin');
  assert.equal(c.sha256,'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21');
  assert.throws(()=>inferenceConfig({SONG_MODEL_PRECISION:'f16'}));
  assert.throws(()=>inferenceConfig({SONG_MODEL_PRECISION:'unknown'}));
});
