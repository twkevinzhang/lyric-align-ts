import {test} from 'node:test';
import assert from 'node:assert/strict';
import {virtualAudio,originalSpan,scaleTimeline} from '../../src/core/audio-time-scale.mjs';
test('fractional time scale covers all original samples without gaps at adjacent windows',()=>{
 const pcm=Float32Array.from({length:11},(_,i)=>i),view=virtualAudio(pcm,2.5);
 assert.equal(view.length,5);
 assert.deepEqual([...originalSpan(pcm,view,view.subarray(0,3),2.5),...originalSpan(pcm,view,view.subarray(3),2.5)],Array.from(pcm));
});
test('virtual audio clock maps every sample range back to original PCM without resampling pitch',()=>{
  const pcm=Float32Array.from([0,1,2,3,4,5,6]);
  const view=virtualAudio(pcm,2);
  assert.equal(view.length,4);
  assert.deepEqual(originalSpan(pcm,view,view.subarray(1,3),2),new Float32Array([2,3,4,5]));
  assert.deepEqual(originalSpan(pcm,view,view.subarray(3),2),new Float32Array([6]));
  assert.throws(()=>virtualAudio(pcm,0));
});
test('scale nested word and token timing while clipping final audio boundary',()=>{
  const timeline=[{text:'a',startTime:1,endTime:4,timeline:[{startTime:1,endTime:4}]}];
  scaleTimeline(timeline,2,7);
  assert.equal(timeline[0].startTime,2);assert.equal(timeline[0].endTime,7);assert.equal(timeline[0].timeline[0].endTime,7);
});
