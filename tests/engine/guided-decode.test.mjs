import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeKnownTokens} from '../../src/engine/guided-decode.mjs';
import {subset} from '../../src/engine/native-context.mjs';
test('token evidence uses prediction rows across prompts, batches and final chunks',async()=>{
 const {decodeAllKnownTokens}=await import('../../src/engine/guided-decode.mjs');
 let batch,qk;const pairs=[];
 const ctx={async decodeTokens(tokens){batch=tokens;qk={dimensions:[1n,BigInt(tokens.length),1n],data:Float32Array.from(tokens)};},async getCrossAttentionQKs(){return qk;},getTokenLogOdds(row,total,target,eot){assert.equal(total,batch.length);assert.equal(eot,99);pairs.push([batch[row],target]);return target;}};
 const out=await decodeAllKnownTokens(ctx,[100,101],[1,2,3,4,5],99,3,2,false,[200,80],true);
 assert.deepEqual(pairs,[[101,1],[1,2],[2,3],[101,4],[4,5],[5,99]]);
 assert.deepEqual(out.decodedTokenLogOdds,[undefined,undefined,1,2,3,4,5,99]);
});
test('native token odds address full vocabulary rows relative to the final row',async()=>{
 const {nativeContext}=await import('../../src/engine/native-context.mjs');
 const memory=new Uint8Array(128);new Float32Array(memory.buffer,16,12).set([0,5,2,0,0,-3,1,0,0,9,3,0]);
 const ctx=nativeContext({HEAPU8:memory,_poc_logits:()=>48,_poc_vocab:()=>4},new Float32Array(1),new Float32Array(1));
 assert.deepEqual([0,1,2].map(row=>ctx.getTokenLogOdds(row,3,1,2)),[3,-4,6]);
 assert.throws(()=>ctx.getTokenLogOdds(3,3,1,2),/Invalid/);
});
test('previous lyric context affects decoding inputs but never leaks into output tokens or attention indices',async()=>{
 const calls=[];let qk;
 const ctx={async decodeTokens(tokens){calls.push(...tokens);qk={dimensions:[1n,BigInt(tokens.length),1n],data:Float32Array.from(tokens)};},async getCrossAttentionQKs(){return qk;}};
 const out=await decodeKnownTokens(ctx,[100,101],[1,2],99,3,2,false,[200,80,81]);
 assert.deepEqual(calls,[200,80,81,100,101,1,2]);
 assert.deepEqual(out.decodedTokens,[100,101,1,2,99]);
 assert.deepEqual(out.decodedTokensCrossAttentionQKs.slice(2).map(q=>q.data[0]),[101,1,2]);
});
test('current-input attention preserves token identities across batches and final chunks',async()=>{
 const {decodeAllKnownTokens}=await import('../../src/engine/guided-decode.mjs');
 let qk;const ctx={async decodeTokens(tokens){qk={dimensions:[1n,BigInt(tokens.length),1n],data:Float32Array.from(tokens)};},async getCrossAttentionQKs(){return qk;}};
 for(const decode of [decodeKnownTokens,decodeAllKnownTokens]){
  const out=await decode(ctx,[100,101],[1,2,3,4,5],99,3,2,true);
  const predicted=out.decodedTokens.slice(2);
  assert.deepEqual(out.decodedTokensCrossAttentionQKs.slice(2).map(q=>q.data[0]),predicted);
  assert.deepEqual(predicted,decode===decodeKnownTokens?[1,2,3]:[1,2,3,4,5,99]);
 }
});
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
