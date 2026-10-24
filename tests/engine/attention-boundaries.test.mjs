import test from 'node:test';
import assert from 'node:assert/strict';
import {introBoundaryFrame} from '../../src/engine/attention-boundaries.mjs';
const q = data => ({dimensions:[1n,1n,BigInt(data.length)],data:Float32Array.from(data)});
test('intro support removes leading gap without moving beyond the first token',()=>{
 const data=Array(100).fill(-10);data.fill(5,30,60);
 assert.equal(introBoundaryFrame(q(data),80,100),30);
});
test('peak consensus ignores minority sinks and sees support across a coarse edge',()=>{
 const data=[];for(let h=0;h<5;h++){const row=Array(110).fill(-10);row.fill(5,h<2?0:78,h<2?3:85);data.push(...row);}
 assert.equal(introBoundaryFrame({dimensions:[5n,1n,110n],data:Float32Array.from(data)},80,110),78);
});
test('flat or short attention preserves the original onset including zero duration',()=>{
 assert.equal(introBoundaryFrame(q(Array(100).fill(2)),80,100),0);
 assert.equal(introBoundaryFrame(q([0,0,9]),2,3),0);
 assert.equal(introBoundaryFrame(q([2,2]),0,2),0);
});
test('sustained plateau and entirely out-of-span evidence preserve the original onset',()=>{
 assert.equal(introBoundaryFrame(q([...Array(40).fill(5),...Array(60).fill(-10)]),80,100),0);
 const data=Array(100).fill(-10);data.fill(5,81,85);
 assert.equal(introBoundaryFrame(q(data),80,100),0);
});
test('a median between disconnected supports is not itself acoustic evidence',()=>{
 const a=Array(100).fill(-10),b=[...a];a.fill(5,30,33);b.fill(5,70,73);
 assert.equal(introBoundaryFrame({dimensions:[2n,1n,100n],data:Float32Array.from([...a,...b])},80,100),0);
});
