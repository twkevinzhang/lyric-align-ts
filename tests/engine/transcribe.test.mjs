import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transcribeAudio} from '../../src/engine/transcribe.mjs';
import {Whisper} from '../../vendor/echogarden/Whisper.mjs';

test('ASR uses independent unrestricted recognition and restores native time scale',async()=>{
 const original=Whisper.prototype.recognize,scales=[],subsets=[];
 const engine={config:{timeScale:2},threads:8,module:{_poc_set_time_scale:s=>(scales.push(s),0),_poc_set_vocab_subset:(p,n)=>(subsets.push([p,n]),0)},whisper:{tiktoken:{}}};
 Whisper.prototype.recognize=async function(audio,task,language,options,filter,callbacks){
  assert.equal(audio.audioChannels[0].length,16000*61);assert.equal(this.audioWindowSeconds,30);
  assert.equal(task,'transcribe');assert.equal(language,'en');assert.equal(options.prompt,undefined);assert.equal(filter,undefined);
  assert.equal(options.topCandidateCount,1);assert.equal(options.suppressRepetition,false);
  callbacks.onPart(' hello',[],[{text:'hello',startTime:1,endTime:2}]);
  callbacks.onPart(' world',[],[{text:'world',startTime:60,endTime:61}]);
  return {timeline:[{text:'hello',startTime:1,endTime:2},{text:'world',startTime:60,endTime:61}]};
 };
 try{const r=await transcribeAudio(engine,new Float32Array(16000*61).fill(.1),'en');assert.deepEqual(r.map(r=>[r.text,r.start,r.end]),[[' hello',1,2],[' world',60,61]]);assert.deepEqual(scales,[1,2]);assert.deepEqual(subsets,[[0,0]]);}
 finally{Whisper.prototype.recognize=original;}
});
test('ASR cleanup restores native scale after decoding failure',async()=>{
 const original=Whisper.prototype.recognize,scales=[];
 Whisper.prototype.recognize=async()=>{throw Error('decoder broke');};
 try{await assert.rejects(transcribeAudio({config:{timeScale:2},threads:8,module:{_poc_set_time_scale:s=>(scales.push(s),0),_poc_set_vocab_subset:()=>0},whisper:{tiktoken:{}}},new Float32Array(16000).fill(.1),'en'),/decoder broke/);assert.deepEqual(scales,[1,2]);}
 finally{Whisper.prototype.recognize=original;}
});
test('digital silence supplies no ASR evidence or invented words',async()=>{
 const engine={};
 assert.deepEqual(await transcribeAudio(engine,new Float32Array(16000),'en'),[]);
 assert.deepEqual(await transcribeAudio(engine,new Float32Array(16000*30),'en'),[]);
});
