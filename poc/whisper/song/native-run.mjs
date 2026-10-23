// Keep the official implementation untouched; record child termination separately.
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {out,hash} from './common.mjs';
const runId=randomUUID();await mkdir(out,{recursive:true});
const child=spawn(process.execPath,[resolve(import.meta.dirname,'native.mjs')],{
  env:{...process.env,SONG_NATIVE_RUN_ID:runId},stdio:'inherit',windowsHide:true,
});
const termination=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(exitCode,signal)=>resolve({exitCode,signal}));});
let resultSha256=null;
try {const bytes=await readFile(resolve(out,'native.json'));if(JSON.parse(bytes).benchmarkRunId===runId)resultSha256=hash(bytes);}catch(error){if(error.code!=='ENOENT')throw error;}
await writeFile(resolve(out,'native-exit.json'),JSON.stringify({runId,...termination,resultSha256,inferenceResultWritten:resultSha256!==null},null,2));
if(termination.exitCode!==0||termination.signal||!resultSha256)process.exitCode=1;
