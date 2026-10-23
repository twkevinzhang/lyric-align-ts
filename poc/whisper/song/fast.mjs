import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {FAST_PRESET} from './fast-preset.mjs';
const command=process.argv[2]??'serve';
if(!['serve','benchmark'].includes(command)||(command==='serve'&&process.argv.length>3)||(command==='benchmark'&&(!process.argv[3]||process.argv.length>5)))throw Error('Usage: node fast.mjs [serve | benchmark experiment [grace,suneo,haru]]');
const source=JSON.parse(await readFile(resolve(import.meta.dirname,'../../../.local/whisper-poc/timescale-source.json')));
if(source.cacheEnabled)throw Error('Fast preset requires the default build without the experimental weight cache');
Object.assign(process.env,FAST_PRESET);
if(command==='benchmark'){
  process.argv=[...process.argv.slice(0,2),...process.argv.slice(3)];
  await import('./benchmark.mjs');
}else await import('./serve.mjs');
