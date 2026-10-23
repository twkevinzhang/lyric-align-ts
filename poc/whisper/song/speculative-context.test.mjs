import {test} from 'node:test';
import assert from 'node:assert/strict';
import {speculativeContext} from './speculative-context.mjs';
test('agreed drafts reuse rows; timestamp mismatch discards future cache',async()=>{
  const calls=[];
  const ctx=speculativeContext(async(tokens,position)=>{
    calls.push({tokens,position});return tokens.map(t=>({logits:Float32Array.of(t),qk:t}));
  },[1,2,3,4],10,4);
  await ctx.decodeTokens([11,12,13],0);
  assert.equal(ctx.getLogits()[0],13);
  await ctx.decodeTokens([1],4);
  await ctx.decodeTokens([2],5);
  assert.equal(calls.length,1);
  await ctx.decodeTokens([15],6);
  assert.deepEqual(calls[1],{tokens:[15,3,4],position:5});
  await ctx.decodeTokens([3],7);
  assert.equal(calls.length,2);
  assert.equal(await ctx.getCrossAttentionQKs(),3);
});
test('drafts never exceed the 448-token model context',async()=>{
  const ctx=speculativeContext(async(tokens,position)=>{
    assert.ok(tokens.length+position<=448);return tokens.map(t=>({logits:Float32Array.of(t),qk:t}));
  },[1,2,3,4],10,16);
  await ctx.decodeTokens([1],448);
});
test('do not compute drafts beyond the remaining decode budget',async()=>{
  const calls=[];
  const ctx=speculativeContext(async(tokens)=>{calls.push(tokens);return tokens.map(t=>({logits:Float32Array.of(t),qk:t}));},[1,2,3,4],10,8,2);
  await ctx.decodeTokens([11,12,13],0);
  await ctx.decodeTokens([1],4);
  assert.deepEqual(calls,[[11,12,13,1]]);
  await assert.rejects(()=>ctx.decodeTokens([2],5),/budget/);
});
