import test from 'node:test';
import assert from 'node:assert/strict';
import {removeAttentionBackground,geometricAttentionHeads} from '../../src/engine/attention-background.mjs';
const q=data=>({dimensions:[2n,1n,3n],data:Float32Array.from(data)});
test('geometric head consensus equals a normalized product of independent temporal distributions',()=>{
 const input=q([5,1,0,-5,1,0]),out=geometricAttentionHeads([input],3)[0];
 const softmax=row=>{const exp=row.map(Math.exp),sum=exp.reduce((a,b)=>a+b);return exp.map(x=>x/sum);};
 const a=softmax([5,1,0]),b=softmax([-5,1,0]),product=a.map((x,i)=>Math.sqrt(x*b[i])),sum=product.reduce((a,b)=>a+b);
 softmax(Array.from(out.data)).forEach((p,i)=>assert.ok(Math.abs(p-product[i]/sum)<1e-12));
 assert.deepEqual(Array.from(out.data),[0,1,0]);
 assert.deepEqual(out.dimensions,[1n,1n,3n]);
});
test('head-specific common temporal bias cancels without moving token contrasts',()=>{
 const inputs=[q([3,1,0,1,5,2]),q([1,3,0,3,1,2])];
 const biased=inputs.map(x=>q(Array.from(x.data,(v,i)=>v+[20,-10,30,-40,50,60][i])));
 const out=removeAttentionBackground(inputs,3);
 assert.deepEqual(out,removeAttentionBackground(biased,3));
 assert.deepEqual(Array.from(out[0].data),[1,-1,0,-1,2,0]);
 assert.deepEqual(Array.from(inputs[0].data),[3,1,0,1,5,2]);
});
test('cropping respects per-head source strides and single-token evidence survives',()=>{
 const inputs=[q([3,1,99,1,5,99]),q([1,3,99,3,1,99])];
 assert.deepEqual(Array.from(removeAttentionBackground(inputs,2)[0].data),[1,-1,-1,2]);
 assert.equal(removeAttentionBackground(inputs.slice(0,1),2)[0],inputs[0]);
 assert.throws(()=>removeAttentionBackground(inputs,4),/shape/);
});
