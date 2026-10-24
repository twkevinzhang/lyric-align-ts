import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeContext} from '../../src/engine/native-context.mjs';
import {virtualAudio} from '../../src/core/audio-time-scale.mjs';
test('native encoder receives exact original samples at scale four including odd final tail',async()=>{
 const pcm=Float32Array.from({length:23},(_,i)=>i),virtual=virtualAudio(pcm,4);
 let received;
 const module={HEAPU8:new Uint8Array(1024),_malloc:()=>16,_free:()=>{},_poc_encode_samples:(p,n)=>{received=Array.from(new Float32Array(module.HEAPU8.buffer,p,n));return 0;}};
 const ctx=nativeContext(module,pcm,virtual,undefined,4);
 await ctx.encodeSamples(virtual.subarray(2));
 assert.deepEqual(received,Array.from({length:15},(_,i)=>i+8));
});
