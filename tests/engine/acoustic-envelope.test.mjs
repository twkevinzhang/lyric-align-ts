import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acousticEnvelope,snapAcousticBoundary} from '../../src/engine/acoustic-envelope.mjs';
test('independent band energy detects a synthetic voice-band entry and exit',()=>{
 const pcm=Float32Array.from({length:48000},(_,i)=>0.05*Math.sin(2*Math.PI*80*i/16000)+(i>=16000&&i<32000?0.5*Math.sin(2*Math.PI*1000*i/16000):0));
 const envelope=acousticEnvelope(pcm);
 assert.ok(Math.abs(snapAcousticBoundary(envelope,0.8,'start')-1)<0.1);
 assert.ok(Math.abs(snapAcousticBoundary(envelope,2.2,'end')-2)<0.1);
});
test('silence supplies no evidence and leaves timestamps unchanged',()=>{
 const envelope=acousticEnvelope(new Float32Array(48000));
 assert.equal(snapAcousticBoundary(envelope,1.5,'start'),1.5);
 assert.equal(snapAcousticBoundary(envelope,1.5,'end'),1.5);
});
