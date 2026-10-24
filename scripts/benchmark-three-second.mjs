import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {staticServer} from './static-server.mjs';
import {parseSrt} from '../src/subtitles.ts';
import {scoreCues} from '../src/core/cue-score.mjs';
import {acceptance} from '../src/core/acceptance.mjs';

const root=resolve(import.meta.dirname,'..');
const config=JSON.parse(await readFile(process.argv[2],'utf8'));
const maximumSeconds=config.maximumSeconds??3;
if(![3,10].includes(maximumSeconds))throw Error('maximumSeconds must be 3 or 10');
const output=resolve(root,'.local/three-second',`${Date.now()}-${config.label??'run'}`);
await mkdir(output,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const hashes={};
async function hashTree(path){for(const entry of await readdir(resolve(root,path),{withFileTypes:true})){const child=path+'/'+entry.name;if(entry.isDirectory())await hashTree(child);else hashes[child]=hash(await readFile(resolve(root,child)));}}
for(const dir of ['src','native','scripts','vendor'])await hashTree(dir);
for(const file of ['dist/index.js','dist/worker.js','dist/assets/parity.wasm','dist/assets/parity.js','.local/native/ggml-tiny-q5_1.bin'])hashes[file]=hash(await readFile(resolve(root,file)));
const model=resolve(root,config.model??'.local/native/ggml-tiny-q5_1.bin');
const inputHashes=[];
for(const song of config.songs){const entry={id:song.id};for(const field of ['audio','lyrics','reference'])entry[field]=hash(await readFile(song[field]));inputHashes.push(entry);}
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const manifest={createdAt:new Date().toISOString(),cpu:cpus()[0].model,logicalProcessors:cpus().length,node:process.version,browser:browser.version(),pid:process.pid,cwd:root,config,hashes,inputHashes};
await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2));
const results=[];
function cpuSnapshot(){return cpus().map(c=>({idle:c.times.idle,total:Object.values(c.times).reduce((s,v)=>s+v,0)}));}
try{
 for(const variant of config.variants??[{id:'production',threads:8}]){
  if(!/^[a-z0-9-]+$/.test(variant.id))throw Error('Invalid variant id');
  let workerPath;
  if(variant.engine){workerPath=resolve(output,variant.id+'.js');await build({entryPoints:[resolve(root,'src/worker.ts')],bundle:true,platform:'browser',target:['es2022'],format:'iife',outfile:workerPath,define:{__ALIGN_EXPERIMENT__:JSON.stringify(variant.engine)}});}
  for(let trial=1;trial<=(config.trials??1);trial++)for(const song of config.songs){
   const server=await staticServer({root,files:{'/model.bin':model,'/audio':resolve(song.audio),'/lyrics':resolve(song.lyrics),...(workerPath?{'/experiment-worker.js':workerPath}:{})}});
   const page=await browser.newPage();let timer;const load=[];let previous=cpuSnapshot();
   try{
    await page.goto(server.url+'/examples/browser/');
    await page.evaluate(async({song,variant,experimental})=>{
     const {createAligner,parseSrt}=await import('/dist/index.js');
     const text=await(await fetch('/lyrics')).text();
     globalThis.benchmarkInput={audio:await(await fetch('/audio')).blob(),lyrics:song.lyrics.endsWith('.srt')?parseSrt(text).map(c=>c.text):text,language:song.language};
     globalThis.benchmarkAligner=await createAligner({modelUrl:location.origin+'/model.bin',threads:variant.threads??8,...(experimental?{workerUrl:location.origin+'/experiment-worker.js'}:{})});
    },{song,variant,experimental:!!workerPath});
    previous=cpuSnapshot();const start=Date.now();
    timer=setInterval(()=>{const current=cpuSnapshot();let idle=0,total=0;for(let i=0;i<current.length;i++){idle+=current[i].idle-previous[i].idle;total+=current[i].total-previous[i].total;}load.push({elapsedMs:Date.now()-start,busyFraction:total?1-idle/total:null});previous=current;},500);
    const result=await page.evaluate(async()=>{const start=performance.now();try{const result=await globalThis.benchmarkAligner.align(globalThis.benchmarkInput);return {...result,outerOperationSeconds:(performance.now()-start)/1000};}finally{globalThis.benchmarkAligner.dispose();}});
    clearInterval(timer);
    const reference=parseSrt(await readFile(song.reference,'utf8'));
    const score=scoreCues({timeline:result.words,audioSeconds:result.audioSeconds},reference);
    const gate=acceptance(result.metrics.operationSeconds,score.rows.map(r=>({...r,startError:r.error})),maximumSeconds);
    const excluded=new Set(gate.excluded.map(r=>r.line));
    const ends=score.rows.filter(r=>!excluded.has(r.line)).map(r=>Number.isFinite(r.end)?Math.abs(r.end-reference[r.line-1].end):NaN);
    const endMeanAbs=ends.every(Number.isFinite)?ends.reduce((s,e)=>s+e,0)/ends.length:null;
    const record={variant:variant.id,trial,song:song.id,server:server.url,load,...result,score,acceptance:gate,endMeanAbs};
    results.push(record);await writeFile(resolve(output,`${variant.id}-${song.id}-${trial}.json`),JSON.stringify(record,null,2));
    console.log(JSON.stringify({variant:variant.id,trial,song:song.id,seconds:result.metrics.operationSeconds,mae:gate.meanAbs,pass:gate.pass,profile:result.metrics.profile,load:load.length?load.reduce((s,x)=>s+x.busyFraction,0)/load.length:null}));
   }finally{clearInterval(timer);await page.close();await server.close();}
  }
 }
}finally{await browser.close();await writeFile(resolve(output,'summary.json'),JSON.stringify({manifest,results},null,2));console.log('OUTPUT '+output);}
if(results.some(result=>!result.acceptance?.pass))process.exitCode=1;
