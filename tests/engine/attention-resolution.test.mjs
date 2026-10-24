import test from 'node:test';
import assert from 'node:assert/strict';
import {coarseAttentionPath} from '../../src/engine/attention-resolution.mjs';
test('coarse attention preserves head/token ownership and odd frame boundaries',async()=>{
 const qks=[{dimensions:[2n,1n,5n],data:Float32Array.from([1,3,5,7,9,10,30,50,70,90])}];
 const finder=async(q,t,start,end)=>{
  assert.deepEqual(t,[7]);assert.equal(start,0);assert.equal(end,3);
  assert.deepEqual(Array.from(q[0].data),[2,6,9,20,60,90]);
  return [{source:0,dest:0},{source:0,dest:1},{source:0,dest:2}];
 };
 assert.deepEqual(await coarseAttentionPath(finder,qks,[7],5,2),[{source:0,dest:0},{source:0,dest:2},{source:0,dest:4}]);
 assert.deepEqual(Array.from(qks[0].data),[1,3,5,7,9,10,30,50,70,90]);
});
