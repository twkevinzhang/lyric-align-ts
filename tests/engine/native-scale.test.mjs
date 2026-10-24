import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeContext} from '../../src/engine/native-context.mjs';
import {virtualAudio} from '../../src/core/audio-time-scale.mjs';
import {Whisper} from '../../vendor/echogarden/Whisper.mjs';
test('fractional window boundaries preserve exact frame count after seconds conversion',()=>{
 const w=new Whisper();
 for(let i=0;i<12;i++)assert.equal(w.secondsRangeToFrameCount(i*6.24,(i+1)*6.24),312);
 assert.equal(w.secondsRangeToFrameCount(0,.0199),0);
});
test('native encoder receives exact original samples at scale four including odd final tail',async()=>{
 const pcm=Float32Array.from({length:23},(_,i)=>i),virtual=virtualAudio(pcm,4);
 let received;
 const module={HEAPU8:new Uint8Array(1024),_malloc:()=>16,_free:()=>{},_poc_encode_samples:(p,n)=>{received=Array.from(new Float32Array(module.HEAPU8.buffer,p,n));return 0;}};
 const ctx=nativeContext(module,pcm,virtual,undefined,4);
 await ctx.encodeSamples(virtual.subarray(2));
 assert.deepEqual(received,Array.from({length:15},(_,i)=>i+8));
});
test('partial final context is rounded up and full context resets on reuse',async()=>{
 const pcm=new Float32Array(64133),virtual=virtualAudio(pcm,2.5),frames=[],counts=[];
 const module={HEAPU8:new Uint8Array(pcm.byteLength+64),_malloc:()=>16,_free:()=>{},_poc_set_audio_context:n=>{frames.push(n);return 0;},_poc_encode_samples:(p,n)=>{counts.push(n);return 0;}};
 const ctx=nativeContext(module,pcm,virtual,undefined,2.5,undefined,64);
 await ctx.encodeSamples(virtual.subarray(0,64*320));
 await ctx.encodeSamples(virtual.subarray(64*320));
 await ctx.encodeSamples(virtual.subarray(0,64*320));
 assert.deepEqual(frames,[64,32,64]);
 assert.deepEqual(counts,[51200,12933,51200]);
});
test('missing logits are rejected instead of reading address zero',()=>{
 const pcm=new Float32Array(8);
 const ctx=nativeContext({HEAPU8:new Uint8Array(64),_poc_logits:()=>0,_poc_vocab:()=>4},pcm,pcm);
 assert.throws(()=>ctx.getLogits(),/unavailable/);
});
