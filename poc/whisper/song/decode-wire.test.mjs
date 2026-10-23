import {test} from 'node:test';
import assert from 'node:assert/strict';
import {packDecode,unpackDecode} from './decode-wire.mjs';
test('decoder wire preserves token order, absent prompt attention and exact float values',()=>{
  const result={decodedTokens:[1,2,3],decodedTokensConfidence:[1,1,0.4],decodedTokensCrossAttentionQKs:[undefined,{dimensions:[1n,1n,2n],data:new Float32Array([0.25,-3])},{dimensions:[1n,1n,2n],data:new Float32Array([0,2])}],decodedTokensInferenceTime:[1,2],decodedTokensDecodingTime:[2,3],decodedTokensOverheadTime:[1,1]};
  const decoded=unpackDecode(packDecode(result));
  assert.deepEqual(decoded,result);
  assert.throws(()=>unpackDecode(new Uint8Array(2)));
});
