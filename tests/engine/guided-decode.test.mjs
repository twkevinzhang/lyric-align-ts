import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeKnownTokens} from '../../src/engine/guided-decode.mjs';
test('teacher forcing pairs each known token with preceding input attention across batches',async()=>{
 const calls=[];let qk;
 const context={async decodeTokens(tokens,past){calls.push({tokens,past});qk={dimensions:[1n,BigInt(tokens.length),2n],data:Float32Array.from(tokens.flatMap(t=>[t,t+.5]))};},async getCrossAttentionQKs(){return qk;}};
 const out=await decodeKnownTokens(context,[100,101],[10,20,30],99,8,2);
 assert.deepEqual(calls,[{tokens:[100,101],past:0},{tokens:[10,20],past:3},{tokens:[30],past:5}]);
 assert.deepEqual(out.decodedTokens,[100,101,10,20,30,99]);
 assert.deepEqual(out.decodedTokensCrossAttentionQKs.slice(2).map(q=>Array.from(q.data)),[[101,101.5],[10,10.5],[20,20.5],[30,30.5]]);
});
test('known decoding respects token budget without dropping its last predicted token',async()=>{
 let qk;const ctx={async decodeTokens(tokens){qk={dimensions:[1n,BigInt(tokens.length),1n],data:new Float32Array(tokens)};},async getCrossAttentionQKs(){return qk;}};
 assert.deepEqual((await decodeKnownTokens(ctx,[100],[1,2,3,4],99,2,128)).decodedTokens,[100,1,2]);
});
