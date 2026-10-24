import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../../src/index.ts';

class WorkerHost {
 static instances=[];
 listeners=new Map(); requests=[]; terminated=false;
 constructor(){WorkerHost.instances.push(this);}
 addEventListener(type,fn){this.listeners.set(type,fn);}
 postMessage(message){this.requests.push(message);}
 reply(result){const {id}=this.requests.at(-1);this.emit('message',{data:{id,type:'result',result}});}
 emit(type,event){this.listeners.get(type)?.(event);}
 terminate(){this.terminated=true;}
}
const context=()=>({signal:new AbortController().signal});
const pcm=()=>({pcm:new Float32Array(16000),sampleRate:16000});
function setup(){
 for(const [key,value] of Object.entries({Worker:WorkerHost,crossOriginIsolated:true,isSecureContext:true}))Object.defineProperty(globalThis,key,{value,configurable:true});
 assert.equal(typeof api.createBinding,'function','public binding factory is missing');
 return api.createBinding();
}
async function prepared(){const b=setup(),s=await b.createSession();const p=s.prepare({},context());const w=WorkerHost.instances.at(-1);w.reply({ready:true});await p;return {b,s,w};}

test('binding is lazy and advertises only options it actually accepts',async()=>{
 const b=setup(),before=WorkerHost.instances.length,s=await b.createSession();
 assert.equal(WorkerHost.instances.length,before);
 assert.equal(b.capabilities.contractVersion,1);assert.equal(b.capabilities.model.device,'wasm');
 assert.equal(b.capabilities.lyricsContext,false);
 await assert.rejects(s.prepare({language:'xx'},context()),{code:'UNSUPPORTED_LANGUAGE'});
 await assert.rejects(s.transcribe(pcm(),{},context()),{code:'INVALID_INPUT'});
 await s.dispose();await s.dispose();
});
test('prepare serializes operations, protects PCM ownership, and can be repeated',async()=>{
 const b=setup(),s=await b.createSession();const pending=s.prepare({language:'en'},context()),w=WorkerHost.instances.at(-1);
 await assert.rejects(s.prepare({},context()),{code:'INVALID_INPUT'});w.reply({ready:true});await pending;
 await s.prepare({},context());assert.equal(w.requests.length,1);
 const audio=pcm(),p=s.transcribe(audio,{},context());
 assert.notEqual(w.requests.at(-1).audio,audio.pcm);assert.equal(audio.pcm.length,16000);
 await assert.rejects(s.align([],['line'],{},context()),{code:'INVALID_INPUT'});
 w.reply([{text:'hello',start:0,end:.5}]);assert.equal((await p)[0].text,'hello');
 const align=s.align([{text:'hello',start:0,end:.5}],['  Hello!  '],{karaoke:false},context());
 w.reply([{line:'  Hello!  ',start:0,end:.5,score:1,matched:true}]);assert.equal((await align)[0].line,'  Hello!  ');
 await s.dispose();assert.ok(w.terminated);
});
test('invalid PCM and unsupported options fail before posting inference',async()=>{
 const {s,w}=await prepared(),before=w.requests.length;
 for(const audio of [{pcm:new Float32Array(),sampleRate:16000},{pcm:new Float32Array([NaN]),sampleRate:16000},{pcm:new Float32Array(1),sampleRate:44100}])await assert.rejects(s.transcribe(audio,{},context()),{code:'INVALID_INPUT'});
 await assert.rejects(s.transcribe(pcm(),{lyricsContext:['hello']},context()),{code:'UNSUPPORTED_OPTION'});
 for(const options of [{pairing:'auto'},{window:10},{karaoke:true}])await assert.rejects(s.align([],['hello'],options,context()),{code:'UNSUPPORTED_OPTION'});
 await assert.rejects(s.align([],['hello'],{threshold:NaN},context()),{code:'INVALID_INPUT'});
 assert.equal(w.requests.length,before);await s.dispose();
});
test('progress uses phase-local increasing sequence and never invents totals',async()=>{
 const b=setup(),s=await b.createSession(),events=[];
 const p=s.prepare({},{...context(),onProgress:e=>events.push(e)}),w=WorkerHost.instances.at(-1),id=w.requests.at(-1).id;
 w.emit('message',{data:{id,type:'progress',stage:'model',completed:10,total:20}});
 w.emit('message',{data:{id,type:'progress',stage:'encoding',completed:5,total:undefined}});
 w.reply({ready:true});await p;
 assert.ok(events.length>=2);assert.ok(events.every(e=>e.phase==='preparing-model'));
 assert.ok(events.every((e,i)=>!i||e.sequence>events[i-1].sequence));
 assert.ok(events.every(e=>e.kind==='indeterminate'),'legacy totals have no units and must not be guessed');
 await s.dispose();
});
test('abort during preparation terminates host, rejects with code and invalidates session',async()=>{
 const b=setup(),s=await b.createSession(),c=new AbortController(),p=s.prepare({},{signal:c.signal}),w=WorkerHost.instances.at(-1);
 c.abort('cancel');await assert.rejects(p,{code:'ABORTED'});assert.ok(w.terminated);
 await assert.rejects(s.prepare({},context()),{code:'INVALID_INPUT'});await s.dispose();await s.dispose();
});
test('pre-aborted context does not create Worker and observer errors are isolated',async()=>{
 const b=setup(),s=await b.createSession(),c=new AbortController(),before=WorkerHost.instances.length;c.abort();
 await assert.rejects(s.prepare({},{signal:c.signal}),{code:'ABORTED'});assert.equal(WorkerHost.instances.length,before);
 const p=s.prepare({},{...context(),onProgress(){throw Error('observer');}});WorkerHost.instances.at(-1).reply({ready:true});await p;await s.dispose();
});
test('worker failures map to stable codes and dispose settles active inference',async()=>{
 const {s,w}=await prepared();const p=s.transcribe(pcm(),{},context());w.emit('error',{message:'crash'});
 await assert.rejects(p,{code:'TRANSCRIPTION_FAILED'});await s.dispose();
 const other=await prepared(),active=other.s.transcribe(pcm(),{},context());await other.s.dispose();await assert.rejects(active,{code:'ABORTED'});
 const b=setup(),failed=await b.createSession(),load=failed.prepare({},context()),host=WorkerHost.instances.at(-1);
 host.emit('message',{data:{id:host.requests.at(-1).id,type:'error',error:{message:'cannot allocate memory',code:'OUT_OF_MEMORY'}}});
 await assert.rejects(load,{code:'OUT_OF_MEMORY'});assert.ok(host.terminated);await failed.dispose();
});
test('disposal from a progress observer cannot create or post to a new Worker',async()=>{
 const b=setup(),s=await b.createSession(),before=WorkerHost.instances.length;
 const pending=s.prepare({},{...context(),onProgress(){void s.dispose();}});
 // Unblock a buggy implementation so the regression fails instead of hanging.
 if(WorkerHost.instances.length>before)WorkerHost.instances.at(-1).reply({ready:true});
 await assert.rejects(pending,{code:'ABORTED'});
 assert.equal(WorkerHost.instances.length,before);
});
