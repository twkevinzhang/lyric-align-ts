import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {staticServer} from './static-server.mjs';

const root=resolve(import.meta.dirname,'..');
if(!process.argv[2]||!process.argv[3])throw Error('Pass benchmark configuration and fresh-result directory');
const config=JSON.parse(await readFile(process.argv[2],'utf8'));
assert.equal(config.songs.length,3);
const files={'/model.bin':resolve(root,config.model??'.local/native/ggml-tiny-q5_1.bin')};
for(const [index,song] of config.songs.entries()){
 files['/audio-'+index]=resolve(song.audio);files['/lyrics-'+index]=resolve(song.lyrics);
}
const server=await staticServer({root,files});let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();await page.goto(server.url+'/examples/browser/');
 const results=await page.evaluate(async songs=>{
  const {createAligner,parseSrt}=await import('/dist/index.js');
  const inputs=[];
  for(const [index,song] of songs.entries()){
   const text=await(await fetch('/lyrics-'+index)).text();
   inputs.push({audio:await(await fetch('/audio-'+index)).blob(),lyrics:song.lyrics.endsWith('.srt')?parseSrt(text).map(c=>c.text):text,language:song.language});
  }
  const aligner=await createAligner({modelUrl:location.origin+'/model.bin',threads:8});
  const results=[];
  try{
   // Different durations/languages exercise reset after a shortened final context.
   for(const index of [1,0,2,0])results.push({song:songs[index].id,result:await aligner.align(inputs[index])});
  }finally{aligner.dispose();}
  return results;
 },config.songs);
 for(const {song,result} of results){
  const fresh=JSON.parse(await readFile(resolve(process.argv[3],`production-${song}-1.json`),'utf8'));
  assert.equal(result.audioSeconds,fresh.audioSeconds,song+' duration');
  assert.equal(result.srt,fresh.srt,song+' SRT changed after reuse');
  assert.deepEqual(result.words,fresh.words,song+' word alignment changed after reuse');
 }
 const deadline=Date.now()+15000;
 while(page.workers().length&&Date.now()<deadline)await page.waitForTimeout(100);
 assert.equal(page.workers().length,0,'Reused instance left workers alive');
 await mkdir(resolve(root,'.local/package'),{recursive:true});
 await writeFile(resolve(root,'.local/package/reuse-three-second.json'),JSON.stringify(results,null,2));
 console.log('Different-song reuse and repeat match fresh SRT/words/duration; workers terminated.');
}finally{await browser?.close();await server.close();}
