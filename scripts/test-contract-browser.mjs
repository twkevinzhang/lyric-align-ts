import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {staticServer} from './static-server.mjs';

const root=resolve(import.meta.dirname,'..');
const model=resolve(process.env.MODEL_PATH??resolve(root,'.local/native/ggml-tiny-q5_1.bin'));
const config=process.argv[2] ? JSON.parse(await readFile(process.argv[2],'utf8')) : undefined;
const songs=config?.songs??[];
const files={'/model.bin':model,'/speech.wav':resolve(root,'.local/native/source/samples/jfk.wav')};
for(let i=0;i<songs.length;i++){files[`/audio-${i}`]=resolve(songs[i].audio);files[`/lyrics-${i}`]=resolve(songs[i].lyrics);}
const server=await staticServer({root,files});let browser;
try{
 const response=await fetch(server.url+'/dist/binding.js',{method:'HEAD'});assert.equal(response.status,200);
 console.log(`Contract test server ${server.url}, command=node scripts/test-contract-browser.mjs, cwd=${root}; closes in finally.`);
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const page=await browser.newPage();page.setDefaultTimeout(600000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='log')console.log(m.text());});await page.goto(server.url+'/examples/browser/');
 const result=await page.evaluate(async(songs)=>{
  const {createBinding}=await import('/dist/binding.js');const {parseSrt}=await import('/dist/index.js');
  const b=createBinding({modelUrl:location.origin+'/model.bin'}),events=[],ctx={signal:new AbortController().signal,onProgress:e=>events.push(e)};
  const session=await b.createSession();const start=performance.now();await session.prepare({language:'en'},ctx);
  async function audio(url){const decoder=new AudioContext();try{const buffer=await decoder.decodeAudioData(await(await fetch(url)).arrayBuffer());const offline=new OfflineAudioContext(1,Math.ceil(buffer.duration*16000),16000),source=offline.createBufferSource();source.buffer=buffer;source.connect(offline.destination);source.start();return{pcm:(await offline.startRendering()).getChannelData(0),sampleRate:16000};}finally{await decoder.close();}}
  try{
   const speech=await audio('/speech.wav'),segments=await session.transcribe(speech,{language:'en'},ctx);
   const speechText=segments.map(s=>s.text).join(' ');console.log('Speech ASR: '+speechText);
   const speechLines=['And so my fellow Americans','ask not what your country can do for you','ask what you can do for your country'];
   const aligned=await session.align(segments,speechLines,{karaoke:false},ctx);
   const silence=[];
   for(const seconds of [1,30])silence.push(await session.transcribe({pcm:new Float32Array(16000*seconds),sampleRate:16000},{language:'en'},ctx));
   const full=[];
   for(let i=0;i<songs.length;i++){
    const song=songs[i],input=await audio(`/audio-${i}`),text=await(await fetch(`/lyrics-${i}`)).text();
    const lines=(song.lyrics.endsWith('.srt')?parseSrt(text).flatMap(c=>c.text.split(/\r?\n/)):text.split(/\r?\n/)).filter(line=>line.trim());
    const began=performance.now();console.log(`Starting full song ${song.id}, ${input.pcm.length/16000}s`);
    const transcript=await session.transcribe(input,{language:song.language},ctx);
    const linesResult=await session.align(transcript,lines,{karaoke:false},ctx);
    full.push({id:song.id,duration:input.pcm.length/16000,elapsedSeconds:(performance.now()-began)/1000,lines,segments:transcript,aligned:linesResult});
    console.log(`Completed ${song.id}: ${linesResult.filter(r=>r.matched).length}/${lines.length} lines`);
   }
   return{capabilities:b.capabilities,speechText,segments,aligned,speechLines,events,silence,full,elapsedSeconds:(performance.now()-start)/1000};
  }finally{await session.dispose();await session.dispose();}
 },songs);
 assert.match(result.speechText,/country/i,'real ASR did not recognize speech');
 assert.deepEqual(result.aligned.map(r=>r.line),result.speechLines);assert.ok(result.aligned.every(r=>r.matched),'speech lines not completely matched');
 assert.deepEqual(result.silence,[[],[]]);
 for(const song of result.full){assert.ok(song.segments.length>0);assert.deepEqual(song.aligned.map(r=>r.line),song.lines);assert.ok(song.segments.every(s=>s.start>=0&&s.end<=song.duration&&s.start<s.end));assert.ok(song.aligned.every(r=>!r.matched||(r.start>=0&&r.start<r.end&&r.end<=song.duration)));}
 const cancelled=await page.evaluate(async()=>{
  const {createBinding}=await import('/dist/binding.js');const b=createBinding({modelUrl:location.origin+'/model.bin'}),s=await b.createSession(),controller=new AbortController();
  await s.prepare({},{signal:controller.signal});const p=s.transcribe({pcm:new Float32Array(16000*90).fill(.1),sampleRate:16000},{},{signal:controller.signal});setTimeout(()=>controller.abort(),20);
  let code;try{await p;}catch(e){code=e.code;}await s.dispose();return code;
 });
 assert.equal(cancelled,'ABORTED');assert.deepEqual(errors,[]);
 const deadline=Date.now()+15000;while(page.workers().length&&Date.now()<deadline)await page.waitForTimeout(100);
 assert.equal(page.workers().length,0,'Worker teardown did not finish');
 await mkdir(resolve(root,'.local/contract'),{recursive:true});await writeFile(resolve(root,'.local/contract/browser.json'),JSON.stringify({...result,cancelled},null,2));
 console.log('Contract real WASM speech, silence, cancellation and teardown passed; song checks verify structure and safe incomplete output only.');
}finally{await browser?.close();await server.close();console.log('Contract test server stopped.');}
