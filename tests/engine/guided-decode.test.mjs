import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeKnownTokens} from '../../src/engine/guided-decode.mjs';
import {subset} from '../../src/engine/native-context.mjs';
test('alignment-only native graph requests just its placeholder output instead of metadata vocabulary',()=>{
 let ids;
 const module={HEAPU8:new Uint8Array(1024),_malloc:()=>16,_free:()=>{},_poc_vocab:()=>110,_poc_set_vocab_subset:(p,n)=>{ids=Array.from(new Int32Array(module.HEAPU8.buffer,p,n));return 0;}};
 subset(module,[1,2],99,true);
 assert.deepEqual(ids,[99]);
});
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

test('dense final lyrics reset bounded decoder chunks and retain real attention for every token',async()=>{
 const {decodeAllKnownTokens}=await import('../../src/engine/guided-decode.mjs');
 const calls=[];let qk;
 const ctx={async decodeTokens(tokens,past){calls.push({tokens,past});assert.ok(past===0);assert.ok(tokens.length<=5);qk={dimensions:[1n,BigInt(tokens.length),1n],data:Float32Array.from(tokens)};},async getCrossAttentionQKs(){return qk;}};
 const out=await decodeAllKnownTokens(ctx,[100,101],[1,2,3,4,5,6,7,8],99,3,440);
 assert.deepEqual(out.decodedTokens,[100,101,1,2,3,4,5,6,7,8,99]);
 assert.equal(calls.length,3);
 assert.deepEqual(out.decodedTokensCrossAttentionQKs.slice(2).map(q=>q.data[0]),[101,1,2,101,4,5,101,7,8]);
 assert.ok(out.decodedTokensConfidence.every(x=>x===1));
});
