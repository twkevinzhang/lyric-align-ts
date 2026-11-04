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
test('abort and dispose reject unfinished file reads before allocating an AudioContext',async()=>{
 environment();let created=0,closed=0;
 Object.defineProperty(globalThis,'AudioContext',{value:class{constructor(){created++;}close(){closed++;return Promise.resolve();}},configurable:true});
 for(const action of ['abort','dispose']){
  const a=await createAligner(),controller=new AbortController(),audio=new Blob(['never finishes']);audio.arrayBuffer=()=>new Promise(()=>{});
  const pending=a.align({audio,lyrics:'hello',language:'en',signal:controller.signal});await new Promise(r=>setTimeout(r,0));
  if(action==='abort')controller.abort();else a.dispose();
  const outcome=await Promise.race([pending.then(()=> 'resolved',()=> 'rejected'),new Promise(r=>setTimeout(()=>r('hung'),100))]);assert.equal(outcome,'rejected');
 }
 assert.equal(created,0);assert.equal(closed,0);
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
test('Japanese alignment re-aligns a suspect run from a slice of the original audio; other languages do not',async()=>{
 environment();
 const lines=['あいうえ','かきくけ','さしすせ','たちつて','なにぬね','はひふへ','まみむめ','やゆよわ'];
 const line=(text,start,length)=>[...text].map((c,i,all)=>({text:c,startTime:start+i*length/all.length,endTime:start+(i+1)*length/all.length,confidence:1,timeline:[{text:c,startTime:start+i*length/all.length,endTime:start+(i+1)*length/all.length}]}));
 const healthy=lines.flatMap((text,i)=>line(text,i*5,4.5));
 const squeezed=[...healthy.slice(0,12),...line(lines[3],24,.2),...line(lines[4],24.2,.2),...healthy.slice(20)];
 const sliceOf=(from,to)=>healthy.filter(w=>w.startTime>=from-.01&&w.endTime<=to+.01).map(w=>({...w,startTime:w.startTime-from,endTime:w.endTime-from,timeline:w.timeline.map(t=>({...t,startTime:t.startTime-from,endTime:t.endTime-from}))}));
 const a=await createAligner(),worker=FakeWorker.instances.at(-1),samples=new Float32Array(45*16000).map((_,i)=>i);
 const pending=a.align({audio:{samples,sampleRate:16000},lyrics:lines.join('\n'),language:'ja'});
 await new Promise(r=>setTimeout(r,0));
 const first=worker.requests.at(-1);assert.equal(first.audio.length,45*16000);
 worker.reply(first.id,{words:squeezed,metrics:{alignmentSeconds:1,totalSeconds:1}});
 await new Promise(r=>setTimeout(r,0));
 const second=worker.requests.at(-1);assert.notEqual(second.id,first.id);assert.equal(second.lyrics,lines.slice(2,6).join('\n'));
 const from=Math.floor(9.7*16000);assert.equal(second.audio[0],from);assert.equal(second.audio.length,Math.ceil(29.8*16000)-from);
 worker.reply(second.id,{words:sliceOf(9.7,29.8),metrics:{alignmentSeconds:1,totalSeconds:1}});
 const result=await pending;
 assert.equal(worker.requests.length,3);
 assert.ok(Math.abs(result.cues[3].start-15)<1e-6&&Math.abs(result.cues[4].start-20)<1e-6);
 assert.equal(result.metrics.refinedLines,2);assert.ok(result.metrics.refinementSeconds>=0);assert.equal(samples.length,45*16000);
 a.dispose();
 const e=await createAligner(),english=FakeWorker.instances.at(-1);
 const waiting=e.align({audio:{samples:new Float32Array(16000),sampleRate:16000},lyrics:'a',language:'en'});await new Promise(r=>setTimeout(r,0));
 english.reply(english.requests.at(-1).id,{words:[{text:'a',startTime:0,endTime:.5,confidence:1}],metrics:{alignmentSeconds:1,totalSeconds:1}});
 const plain=await waiting;assert.equal(english.requests.length,2);assert.equal(plain.metrics.refinedLines,0);e.dispose();
});
test('aborting during refinement terminates the worker and rejects with AbortError',async()=>{
 environment();
 const lines=['あいうえ','かきくけ','さしすせ','たちつて','なにぬね','はひふへ','まみむめ','やゆよわ'];
 const line=(text,start,length)=>[...text].map((c,i,all)=>({text:c,startTime:start+i*length/all.length,endTime:start+(i+1)*length/all.length,confidence:1}));
 const healthy=lines.flatMap((text,i)=>line(text,i*5,4.5));
 const squeezed=[...healthy.slice(0,12),...line(lines[3],24,.2),...line(lines[4],24.2,.2),...healthy.slice(20)];
 const a=await createAligner(),worker=FakeWorker.instances.at(-1),controller=new AbortController();
 const pending=a.align({audio:{samples:new Float32Array(45*16000),sampleRate:16000},lyrics:lines.join('\n'),language:'ja',signal:controller.signal});
 await new Promise(r=>setTimeout(r,0));worker.reply(worker.requests.at(-1).id,{words:squeezed,metrics:{alignmentSeconds:1,totalSeconds:1}});
 await new Promise(r=>setTimeout(r,0));assert.equal(worker.requests.length,3);
 controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.ok(worker.terminated);
});
