import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceWorker} from '../../src/engine/voice-worker-client.mjs';
test('parallel voice transfer uses a copy and disposal rejects pending requests',async()=>{
 let worker;
 class Fake{
  constructor(){worker=this;}
  postMessage(data,transfer){this.last={data,transfer};if(data.type==='initialize')queueMicrotask(()=>this.onmessage({data:{id:data.id,result:{ready:true}}}));}
  terminate(){this.stopped=true;}
 }
 const client=await createVoiceWorker('/voice.js','/model.js',Fake),audio=Float32Array.of(.1,.2),job=client.infer(audio);
 assert.notEqual(worker.last.data.audio.buffer,audio.buffer);
 assert.deepEqual(worker.last.transfer,[worker.last.data.audio.buffer]);
 const rejected=assert.rejects(job,/disposed/);client.dispose();await rejected;assert.equal(worker.stopped,true);
 await assert.rejects(client.infer(audio),/disposed/);
});
test('voice initialization failure terminates its worker',async()=>{
 let stopped=false;
 class Fake{postMessage(data){queueMicrotask(()=>this.onmessage({data:{id:data.id,error:'model unavailable'}}));}terminate(){stopped=true;}}
 await assert.rejects(createVoiceWorker('/voice.js','/missing.js',Fake),/model unavailable/);assert.equal(stopped,true);
});
