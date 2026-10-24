import{readFile,writeFile,mkdir}from'node:fs/promises';
import{resolve,dirname}from'node:path';
import{chromium}from'playwright';
import{staticServer}from'./static-server.mjs';
import{parseSrt}from'../src/subtitles.ts';
import{scoreCues}from'../src/core/cue-score.mjs';
import{acceptance}from'../src/core/acceptance.mjs';
import{createHash}from'node:crypto';
const configPath=process.argv[2];if(!configPath)throw Error('Usage: node scripts/benchmark-browser.mjs <fixtures.json>');
const config=JSON.parse(await readFile(configPath)),root=resolve(import.meta.dirname,'..');
const output=resolve(root,'.local/package/benchmark-'+Date.now());await mkdir(output,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');const results=[];
for(const song of config.songs){
 if(!/^[a-z][a-z0-9-]*$/.test(song.id))throw Error('Fixture id must be a safe lowercase filename');
 const files={'/model.bin':resolve(config.model??resolve(root,'.local/native/ggml-tiny-q5_1.bin')),'/audio':resolve(song.audio),'/lyrics':resolve(song.lyrics)};
 const server=await staticServer({root,files});let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});const page=await browser.newPage();page.on('console',m=>{if(m.type()==='error')console.error(m.text());});await page.goto(server.url+'/examples/browser/');
  const result=await page.evaluate(async({language,lyricsAreSrt})=>{
   const {createAligner,parseSrt}=await import('/dist/index.js');const text=await(await fetch('/lyrics')).text();const lyrics=lyricsAreSrt?parseSrt(text).map(c=>c.text):text;
   const a=await createAligner({modelUrl:location.origin+'/model.bin'});try{return await a.align({audio:await(await fetch('/audio')).blob(),lyrics,language,onProgress:p=>console.log(p.stage)});}finally{a.dispose();}
  },{language:song.language,lyricsAreSrt:song.lyrics.endsWith('.srt')});
  const audioBytes=await readFile(song.audio),lyricBytes=await readFile(song.lyrics);let score,gate;
  if(song.reference){const reference=parseSrt(await readFile(song.reference,'utf8'));score=scoreCues({timeline:result.words,audioSeconds:result.audioSeconds},reference);gate=acceptance(result.metrics.operationSeconds,score.rows.map(r=>({...r,startError:r.error})));}
  const record={id:song.id,language:song.language,audioSha256:hash(audioBytes),lyricsSha256:hash(lyricBytes),...result,score,acceptance:gate};results.push(record);
  await writeFile(resolve(output,song.id+'.json'),JSON.stringify(record,null,2));console.log(JSON.stringify({id:song.id,metrics:result.metrics,cues:result.cues.length,issues:result.cues.filter(c=>c.issues.length).length,acceptance:gate}));
 }finally{await browser?.close();await server.close();}
}
await writeFile(resolve(output,'summary.json'),JSON.stringify({createdAt:new Date().toISOString(),browserOnly:true,results},null,2));console.log('OUTPUT '+output);
