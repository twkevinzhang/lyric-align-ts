import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceProbabilities,correctVoicedCues} from '../../src/engine/voice-runtime.mjs';
import {scorePublicCues} from '../../src/core/cue-score.mjs';
function fake(fail=false){
 const buffer=new ArrayBuffer(2048),freed=[],frames=[];let next=8,destroyed=0;
 const m={HEAP16:new Int16Array(buffer),HEAP32:new Int32Array(buffer),HEAPF32:new Float32Array(buffer),_malloc:n=>{const p=next;next+=n;return p;},_free:p=>freed.push(p),_ten_vad_create:p=>{m.HEAP32[p/4]=7;return 0;},_ten_vad_destroy:()=>destroyed++,_ten_vad_process:(h,p,n,out)=>{assert.equal(h,7);frames.push(Array.from(m.HEAP16.subarray(p/2,p/2+n)));m.HEAPF32[out/4]=.75;return fail?-1:0;}};
 return {m,freed,frames,get destroyed(){return destroyed;}};
}
test('voice inference reconstructs signed PCM and pads only final tail',()=>{
 const f=fake(),pcm=new Float32Array(257);pcm[0]=-1;pcm[1]=1;pcm[2]=1234*Math.fround(1/32767);pcm[256]=-.5;
 assert.deepEqual(voiceProbabilities(f.m,pcm),{values:[.75,.75],step:.016});
 assert.deepEqual(f.frames[0].slice(0,3),[-32768,32767,1234]);
 assert.equal(f.frames[1][0],-16384);assert.ok(f.frames[1].slice(1).every(x=>x===0));
 assert.equal(f.destroyed,1);assert.equal(f.freed.length,4);
});
test('inference failure destroys state and releases every allocation',()=>{
 const f=fake(true);assert.throws(()=>voiceProbabilities(f.m,new Float32Array(1)),/inference/);assert.equal(f.destroyed,1);assert.equal(f.freed.length,4);
});
test('public cue scoring follows returned sentence endpoints and preserves missing text failures',()=>{
 const result={audioSeconds:4,cues:[{text:'hello',start:1,end:2,matched:true},{text:'world',start:3,end:4,matched:false}]};
 const score=scorePublicCues(result,[{text:'hello',start:1,end:2},{text:'world',start:3,end:4}]);
 assert.equal(score.rows[0].end,2);assert.equal(score.rows[0].usable,true);assert.equal(score.rows[1].usable,false);
 const invalid=[{text:'hello',start:null,end:null,matched:false,issues:['unmatched-text']}];
 assert.equal(correctVoicedCues(invalid,{values:[],step:.016},4),invalid);
});
