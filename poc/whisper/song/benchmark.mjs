import {spawn} from 'node:child_process';
import {mkdir,open,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {songs,mediaRoot} from './three-song-config.mjs';
import {parseSrt} from '../../../spike/app/lib/reference.ts';
import {scoreCues} from './cue-score.mjs';
import {acceptance} from './acceptance.mjs';
import {spokenLyrics} from './lyrics.mjs';

const root=resolve(import.meta.dirname,'../../..');
const local=resolve(root,'.local/whisper-poc');
const experiment=process.argv[2];
if(!/^[a-z][a-z0-9-]*$/.test(experiment??''))throw Error('Usage: node benchmark.mjs experiment [grace,suneo,haru]');
const selected=process.argv[3]?.split(',')??songs.map(s=>s.id);
if(selected.some(id=>!songs.some(s=>s.id===id)))throw Error('Unknown song');
const playwrightPath=process.env.PLAYWRIGHT_MODULE??'C:/Users/DragonXwin10/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(playwrightPath));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
for(const song of songs.filter(s=>selected.includes(s.id))){
  const profile=`speed-${experiment}-${song.id}`,folder=resolve(local,profile);
  await mkdir(folder,{recursive:true});
  // A failed retry cannot leave a previous successful result eligible for validation.
  for(const file of ['wasm.json','evaluation.json','stopped.json'])await rm(resolve(folder,file),{force:true});
  // Never reuse a previous completed output for a fresh measurement.
  const nonce=crypto.randomUUID();
  const log=await open(resolve(folder,`server-${nonce}.log`),'w');
  const env={...process.env,SONG_THREADS:process.env.SONG_THREADS??'8',SONG_POOL_SIZE:'12',SONG_WASM_BUILD:process.env.SONG_WASM_BUILD??'compact12',SONG_OUTPUT:profile,SONG_DIR:resolve(mediaRoot,song.directory),SONG_AUDIO:'256k-16kHz-單聲道.wav',SONG_LYRICS:song.lyrics,SONG_LANGUAGE:song.language};
  // Refuse to interfere with another server.
  try{await fetch('http://127.0.0.1:5174/status');throw Error('Port 5174 is occupied');}catch(e){if(!e.cause)throw e;}
  const server=spawn(process.execPath,['poc/whisper/song/serve.mjs'],{cwd:root,env,stdio:['ignore',log.fd,log.fd],windowsHide:true});
  let browser;
  const started=Date.now();
  await writeFile(resolve(folder,'lifecycle.json'),JSON.stringify({command:[process.execPath,'poc/whisper/song/serve.mjs'],cwd:root,port:5174,pid:server.pid,nonce,startedAt:new Date().toISOString()},null,2));
  try{
    server.on('error',e=>console.error(e));
    let ready=false;
    for(let i=0;i<120;i++){
      if(server.exitCode!==null)throw Error(`Server exited: ${server.exitCode}`);
      try{const r=await fetch('http://127.0.0.1:5174/',{method:'HEAD'});if(r.ok){ready=true;break;}}catch{}
      await pause(500);
    }
    if(!ready)throw Error('Server readiness timeout');
    const config=await(await fetch('http://127.0.0.1:5174/config')).json();
    browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
    const page=await browser.newPage();
    const browserLog=await open(resolve(folder,`browser-${nonce}.log`),'w');
    page.on('console',m=>{void browserLog.appendFile(`${m.type()} ${m.text()}\n`);});
    try{
      await page.goto('http://127.0.0.1:5174/');
      await page.getByRole('button',{name:'開始完整音檔推論'}).click();
      let last='';
      for(;;){
        if(Date.now()-started>30*60*1000)throw Error('Full-song benchmark timeout');
        const status=await(await fetch('http://127.0.0.1:5174/status')).json();
        if(status.status!==last){console.log(`${song.id}: ${status.status}`);last=status.status;}
        if(status.status.startsWith('失敗'))throw Error(status.status);
        if(status.complete)break;
        await pause(1000);
      }
      const run=JSON.parse(await readFile(resolve(folder,'wasm.json')));
      if(run.runId!==config.runId)throw Error('Stale measurement');
      const reference=parseSrt(await readFile(resolve(mediaRoot,song.directory,song.reference),'utf8'));
      const scoredReference=run.annotationPolicy==='strip-translations'?reference.map(r=>({...r,text:spokenLyrics(r.text)})):reference;
      const score=scoreCues(run,scoredReference);
      score.rows.forEach((r,i)=>{r.originalText=reference[i].text;});
      const gate=acceptance(run.totalSeconds,score.rows.map(r=>({...r,startError:r.error})));
      const evaluation={experiment,song:song.id,createdAt:new Date().toISOString(),runId:run.runId,score,acceptance:gate};
      await writeFile(resolve(folder,'evaluation.json'),JSON.stringify(evaluation,null,2));
      console.log(JSON.stringify({song:song.id,seconds:run.totalSeconds,metrics:run.metrics,acceptance:gate},(k,v)=>k==='calls'?undefined:v));
    }finally{await browserLog.close();}
  }finally{
    try{await browser?.close();}finally{
    server.kill();
    await Promise.race([new Promise(r=>server.once('exit',r)),pause(5000)]);
    await log.close();
    let listening=false;try{await fetch('http://127.0.0.1:5174/status');listening=true;}catch{}
    await writeFile(resolve(folder,'stopped.json'),JSON.stringify({pid:server.pid,stoppedAt:new Date().toISOString(),listening},null,2));
    if(listening)throw Error('Owned server failed to stop');
    }
  }
}
