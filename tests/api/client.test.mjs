import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAligner} from '../../src/index.ts';

class FakeWorker {
 static instances=[]; listeners=new Map(); terminated=false; requests=[];
 constructor(){FakeWorker.instances.push(this);}
 addEventListener(type,fn){this.listeners.set(type,fn);}
 postMessage(message){this.requests.push(message);if(message.type==='initialize')queueMicrotask(()=>this.reply(message.id,{ready:true}));}
 reply(id,result){this.listeners.get('message')?.({data:{id,type:'result',result}});}
 terminate(){this.terminated=true;}
}
function environment(){for(const[k,v]of Object.entries({Worker:FakeWorker,crossOriginIsolated:true,isSecureContext:true}))Object.defineProperty(globalThis,k,{value:v,configurable:true});}
test('import has no browser side effects; unsupported runtime fails before starting worker',async()=>{
 environment();Object.defineProperty(globalThis,'crossOriginIsolated',{value:false,configurable:true});
 await assert.rejects(createAligner(),/COOP|isolat/i);
});
test('initialization, input ownership, cue output and busy protection',async()=>{
 environment();const aligner=await createAligner();const worker=FakeWorker.instances.at(-1),samples=new Float32Array(16000);
 const pending=aligner.align({audio:{samples,sampleRate:16000},lyrics:'hello\nworld',language:'en'});
 await new Promise(r=>setTimeout(r,0));await assert.rejects(aligner.align({audio:{samples,sampleRate:16000},lyrics:'other',language:'en'}),/busy|progress/i);
 const request=worker.requests.at(-1);assert.equal(request.type,'align');assert.notEqual(request.audio,samples);
 worker.reply(request.id,{words:[{text:'hello',startTime:0,endTime:.4,confidence:1},{text:'world',startTime:.5,endTime:.9,confidence:1}],metrics:{alignmentSeconds:1,totalSeconds:1}});
 const result=await pending;assert.equal(result.cues.length,2);assert.ok(result.srt.includes('00:00:00,500 --> 00:00:00,900'));assert.equal(samples.length,16000);aligner.dispose();assert.ok(worker.terminated);
});
test('abort terminates compute, rejects pending work, and cannot revive disposed instance',async()=>{
 environment();const a=await createAligner(),worker=FakeWorker.instances.at(-1),controller=new AbortController();
 const pending=a.align({audio:{samples:new Float32Array(16000),sampleRate:16000},lyrics:'hello',language:'en',signal:controller.signal});controller.abort();
 await assert.rejects(pending,{name:'AbortError'});assert.ok(worker.terminated);await assert.rejects(a.align({audio:{samples:new Float32Array(1),sampleRate:16000},lyrics:'a',language:'en'}),/disposed/i);
});
test('worker crash rejects rather than leaving a hanging operation',async()=>{
 environment();const a=await createAligner(),worker=FakeWorker.instances.at(-1);
 const pending=a.align({audio:{samples:new Float32Array(16000),sampleRate:16000},lyrics:'a',language:'en'});await new Promise(r=>setTimeout(r,0));worker.listeners.get('error')?.({message:'worker failed'});
 await assert.rejects(pending,/worker failed/);assert.ok(worker.terminated);
});
test('abort and dispose reject immediately even when file reading never completes',async()=>{
 environment();let closed=0;
 Object.defineProperty(globalThis,'AudioContext',{value:class{close(){closed++;return Promise.resolve();}},configurable:true});
 for(const action of ['abort','dispose']){
  const a=await createAligner(),controller=new AbortController(),audio=new Blob(['never finishes']);audio.arrayBuffer=()=>new Promise(()=>{});
  const pending=a.align({audio,lyrics:'hello',language:'en',signal:controller.signal});await new Promise(r=>setTimeout(r,0));
  if(action==='abort')controller.abort();else a.dispose();
  const outcome=await Promise.race([pending.then(()=> 'resolved',()=> 'rejected'),new Promise(r=>setTimeout(()=>r('hung'),100))]);assert.equal(outcome,'rejected');
 }
 assert.equal(closed,2);
});
test('abort and dispose reject unresolved decoding and close its AudioContext',async()=>{
 environment();let closed=0;
 Object.defineProperty(globalThis,'AudioContext',{value:class{decodeAudioData(){return new Promise(()=>{});}close(){closed++;return Promise.resolve();}},configurable:true});
 for(const action of ['abort','dispose']){
  const a=await createAligner(),controller=new AbortController();
  const pending=a.align({audio:new Blob(['undecoded']),lyrics:'hello',language:'en',signal:controller.signal});await new Promise(r=>setTimeout(r,0));
  if(action==='abort')controller.abort();else a.dispose();
  const outcome=await Promise.race([pending.then(()=> 'resolved',e=>e.name==='AbortError'?'abort':e.message),new Promise(r=>setTimeout(()=>r('hung'),100))]);
  if(action==='abort')assert.equal(outcome,'abort');else assert.match(outcome,/disposed/);
 }
 assert.equal(closed,2);
});
test('abort rejects unresolved OfflineAudioContext rendering',async()=>{
 environment();Object.defineProperty(globalThis,'OfflineAudioContext',{value:class{
  createBufferSource(){return{connect(){},start(){}};}createBuffer(){return{copyToChannel(){}};}startRendering(){return new Promise(()=>{});}
 },configurable:true});
 const a=await createAligner(),controller=new AbortController();
 const audio={numberOfChannels:1,length:44100,sampleRate:44100,getChannelData:()=>new Float32Array(44100)};
 const pending=a.align({audio,lyrics:'hello',language:'en',signal:controller.signal});await new Promise(r=>setTimeout(r,0));controller.abort();
 const outcome=await Promise.race([pending.then(()=> 'resolved',e=>e.name),new Promise(r=>setTimeout(()=>r('hung'),100))]);assert.equal(outcome,'AbortError');
});
