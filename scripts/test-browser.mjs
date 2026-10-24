import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {staticServer} from './static-server.mjs';
const root=resolve(import.meta.dirname,'..');
const model=resolve(process.env.MODEL_PATH??resolve(root,'.local/native/ggml-tiny-q5_1.bin'));
await readFile(model); // Fail clearly before starting Chrome if the model is missing.
const server=await staticServer({root,files:{'/fixtures/model.bin':model}});
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.url+'/examples/browser/');
 const result=await page.evaluate(async()=>{
  const {createAligner}=await import('/dist/index.js');
  const options={modelUrl:location.origin+'/fixtures/model.bin'};
  // Static HTTP failures and integrity errors must reject initialization.
  let badFetch=false,badHash=false;
  try{await createAligner({...options,modelUrl:location.origin+'/fixtures/missing.bin'});}catch(e){badFetch=/HTTP 404/.test(e.message);}
  try{await createAligner({...options,modelSha256:'0'.repeat(64)});}catch(e){badHash=/SHA256/.test(e.message);}
  const a=await createAligner(options);const progress=[];
  // Real encoder/decoder work on silence is a runtime smoke test, not accuracy evidence.
  const first=await a.align({audio:{samples:new Float32Array(16000*3),sampleRate:16000},lyrics:'hello world',language:'en',onProgress:p=>progress.push(p.stage)});
  const second=await a.align({audio:{samples:new Float32Array(16000*3),sampleRate:16000},lyrics:'hello world',language:'en'});
  // Exceed one native text context. Every suffix token must receive actual
  // attention; upstream's synthesized confidence-zero filler is not coverage.
  const dense=await a.align({audio:{samples:new Float32Array(16000*3),sampleRate:16000},lyrics:Array(500).fill('hello').join(' '),language:'en'});
  a.dispose();let disposed=false;try{await a.align({audio:{samples:new Float32Array(1),sampleRate:16000},lyrics:'hello',language:'en'});}catch(e){disposed=/disposed/.test(e.message);}
  const cancel=await createAligner(options),controller=new AbortController();const pending=cancel.align({audio:{samples:new Float32Array(16000*30),sampleRate:16000},lyrics:'hello world',language:'en',signal:controller.signal});setTimeout(()=>controller.abort(),10);let aborted=false;try{await pending;}catch(e){aborted=e.name==='AbortError';}
  return{badFetch,badHash,disposed,aborted,first,second,dense,progress};
 });
 assert.equal(result.badFetch,true);assert.equal(result.badHash,true);assert.equal(result.disposed,true);assert.equal(result.aborted,true);assert.equal(result.first.words.length>0,true);assert.equal(result.second.words.length>0,true);assert.deepEqual(result.first.words,result.second.words);assert.deepEqual(errors,[]);
 assert.equal(result.dense.words.length,500,'Dense final lyrics lost words');
 assert.ok(result.dense.words.every(word=>word.confidence>0),'Dense suffix used synthesized filler');
 // Chrome propagates termination to pthread Workers after a synchronous WASM
 // kernel returns; the operation rejects immediately, teardown is eventual.
 const cleanupDeadline=Date.now()+15000;
 while(page.workers().length&&Date.now()<cleanupDeadline)await page.waitForTimeout(100);
 assert.equal(page.workers().length,0,'Disposed/cancelled Worker remains alive after teardown deadline');
 await mkdir(resolve(root,'.local/package'),{recursive:true});await writeFile(resolve(root,'.local/package/browser-smoke.json'),JSON.stringify(result,null,2));console.log('Real Chrome browser-only WASM smoke, reuse, fetch/hash failure and cancellation checks passed.');
}finally{await browser?.close();await server.close();}
