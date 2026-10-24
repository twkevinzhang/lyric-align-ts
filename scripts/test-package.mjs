import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {chromium} from 'playwright';
import {staticServer} from './static-server.mjs';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'.local/package');await mkdir(out,{recursive:true});
const cli=process.env.npm_execpath;if(!cli)throw Error('Run this check with npm run test:package or pnpm run test:package');
execFileSync(process.execPath,[cli,'pack','--pack-destination',out],{cwd:root,stdio:'inherit'});
const tgz=resolve(out,`lyric-align-ts-${JSON.parse(await readFile(resolve(root,'package.json'))).version}.tgz`);
const tar=gunzipSync(await readFile(tgz)),files=[];
for(let offset=0;offset+512<=tar.length;){const header=tar.subarray(offset,offset+512);if(!header.some(Boolean))break;const name=header.subarray(0,100).toString().replace(/\0.*$/s,''),prefix=header.subarray(345,500).toString().replace(/\0.*$/s,'');const size=parseInt(header.subarray(124,136).toString().replace(/\0.*$/s,'').trim()||'0',8);files.push(prefix?prefix+'/'+name:name);offset+=512+Math.ceil(size/512)*512;}
assert.ok(files.includes('package/dist/assets/parity.wasm'));assert.ok(files.includes('package/dist/worker.js'));assert.ok(files.includes('package/dist/index.d.ts'));
for(const name of files)assert.ok(/^package\/(?:dist\/|README\.md$|LICENSE$|THIRD_PARTY_NOTICES\.md$|package\.json$)/.test(name),`Unexpected packed file ${name}`);
assert.ok(!files.some(f=>/ggml-.*\.bin$|\.wav$|\/node_modules\/|\/(?:spike|poc|native|scripts)\//.test(f)));
const consumer=resolve(out,'consumer-'+Date.now());await mkdir(consumer);
await writeFile(resolve(consumer,'package.json'),JSON.stringify({name:'lyric-align-consumer-check',private:true,type:'module',dependencies:{'lyric-align-ts':'file:'+tgz.replaceAll('\\','/')}},null,2));
execFileSync(process.execPath,[cli,'install','--ignore-scripts','--offline',...(basename(cli).includes('pnpm')?['--ignore-workspace']:[])],{cwd:consumer,stdio:'inherit'});
await writeFile(resolve(consumer,'check.ts'),`import {createAligner,parseSrt,toSrt,type AlignmentResult,type AudioInput} from 'lyric-align-ts';\nconst audio:AudioInput={samples:new Float32Array(16000),sampleRate:16000};\nasync function check(){const a=await createAligner();const r:AlignmentResult=await a.align({audio,lyrics:['hello'],language:'en'});toSrt(r.cues);parseSrt(r.srt);a.dispose();}\nvoid check;\n`);
execFileSync(process.execPath,[resolve(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--skipLibCheck','false','--module','nodenext','--moduleResolution','nodenext','--target','es2022','--lib','dom,es2022',resolve(consumer,'check.ts')],{cwd:consumer,stdio:'inherit'});
const model=resolve(process.env.MODEL_PATH??resolve(root,'.local/native/ggml-tiny-q5_1.bin'));
await writeFile(resolve(consumer,'index.html'),'<!doctype html><title>installed package test</title>');
const server=await staticServer({root:consumer,files:{'/model.bin':model}});let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();await page.goto(server.url);
 const result=await page.evaluate(async()=>{const{createAligner}=await import('/node_modules/lyric-align-ts/dist/index.js');const a=await createAligner({modelUrl:location.origin+'/model.bin'});try{const r=await a.align({audio:{samples:new Float32Array(16000),sampleRate:16000},lyrics:'hello',language:'en'});return{words:r.words.length,cues:r.cues.length,metrics:r.metrics};}finally{a.dispose();}});
 assert.ok(result.words>0);assert.equal(result.cues,1);
 await writeFile(resolve(out,'package-check.json'),JSON.stringify({tarball:tgz,files,consumer,result},null,2));
 console.log('Tarball allowlist, isolated consumer installation/types and actual Chrome WASM inference passed.');
}finally{await browser?.close();await server.close();}
