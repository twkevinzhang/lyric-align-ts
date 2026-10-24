import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {staticServer} from './static-server.mjs';
import {DEFAULT_MODEL_URL} from '../src/model.ts';

const consumer=process.argv[2];if(!consumer)throw Error('Usage: node scripts/test-consumer-contract.mjs <yt-subtitle checkout> (read-only)');
const root=resolve(import.meta.dirname,'..'),scratch=resolve(root,'.local/contract');await mkdir(scratch,{recursive:true});
const source=resolve(consumer,'src/subtitle').replaceAll('\\','/');
const typecheck=resolve(scratch,'consumer-types.ts');
await writeFile(typecheck,`import {createBinding} from '../../dist/index.js';import type {LyricAlignBinding} from ${JSON.stringify(source+'/library-contract.ts')};const binding:LyricAlignBinding=createBinding();void binding;`);
execFileSync(process.execPath,[resolve(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--module','esnext','--moduleResolution','bundler','--allowImportingTsExtensions','--target','es2022','--lib','dom,es2022',typecheck],{cwd:root,stdio:'inherit'});
await build({stdin:{contents:`export {resolveLibrary} from ${JSON.stringify(source+'/library-loader.ts')};export {runUntimed} from ${JSON.stringify(source+'/library-runner.ts')};export {prepareLyrics} from ${JSON.stringify(source+'/source-input.ts')};`,resolveDir:root},bundle:true,platform:'browser',format:'esm',target:'es2022',outfile:resolve(scratch,'consumer.js')});
const files={'/consumer.js':resolve(scratch,'consumer.js'),'/speech.wav':resolve(root,'.local/native/source/samples/jfk.wav')};
async function mapDist(dir,prefix){for(const file of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,file.name),url=prefix+'/'+file.name;if(file.isDirectory())await mapDist(path,url);else files[url]=path;}}
await mapDist(resolve(root,'dist'),'/vendor/lyric-align-ts');
const server=await staticServer({root,files});let browser;
try{
 assert.equal((await fetch(server.url+'/vendor/lyric-align-ts/index.js',{method:'HEAD'})).status,200);
 console.log('Read-only consumer test server '+server.url);
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
 await page.route(DEFAULT_MODEL_URL,route=>route.fulfill({path:resolve(root,'.local/native/ggml-tiny-q5_1.bin'),contentType:'application/octet-stream',headers:{'access-control-allow-origin':'*','cross-origin-resource-policy':'cross-origin'}}));
 await page.goto(server.url+'/examples/browser/');
 const result=await page.evaluate(async()=>{
  const {resolveLibrary,runUntimed,prepareLyrics}=await import('/consumer.js');
  const binding=await resolveLibrary(); // Actual consumer loader, including version gate.
  const decoder=new AudioContext({sampleRate:16000});let decoded;try{decoded=await decoder.decodeAudioData(await(await fetch('/speech.wav')).arrayBuffer());}finally{await decoder.close();}
  const rawText='  And so my fellow Americans  \n\nask not what your country can do for you\nask what you can do for your country';
  const lyrics=prepareLyrics(rawText),context={signal:new AbortController().signal};
  const output=await runUntimed(binding,{pcm:decoded.getChannelData(0),sampleRate:16000},lyrics,'en',context);
  const rejected=await runUntimed(binding,{pcm:new Float32Array(16000),sampleRate:16000},lyrics,'en',context);
  return{output,rejected,lyrics,capabilities:binding.capabilities};
 });
 assert.equal(result.output.kind,'complete');assert.equal(result.output.cues.length,3);assert.equal(result.output.cues[0].text,'  And so my fellow Americans  ');
 assert.equal(result.rejected.kind,'incomplete');assert.equal(result.rejected.lineIndexes.length,3);
 await writeFile(resolve(scratch,'consumer.json'),JSON.stringify(result,null,2));
 console.log('Actual yt-subtitle loader, runner and validator accepted real speech and rejected silence without consumer edits.');
}finally{await browser?.close();await server.close();console.log('Consumer test server stopped.');}
