import {writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {prepare,official,options,out,hash,language,cachePolicy,decoderThreads,audioTimeScale} from './common.mjs';
if(cachePolicy!=='upstream'||audioTimeScale!==1||decoderThreads!==options.threadCount||Number(process.env.SONG_SPECULATIVE_BATCH??1)!==1)throw Error('Native diagnostic does not implement these Worker-only settings');
const input=await prepare();
const {Whisper,loadLibraryPackages}=await official('recognition/WhisperSTT.js');
const {libPath}=await loadLibraryPackages(false,{logLevel:'info'});
const whisper=new Whisper(options.model,input.modelPath,libPath);
const start=performance.now();
const metrics={encodeMs:0,decodeMs:0,encodeCalls:0,decodeCalls:0,initialLogits:[]};
if(process.env.SONG_DIAGNOSTIC==='1') {
  process.on('beforeExit',code=>console.error('NATIVE_LIFECYCLE beforeExit',code));
  process.on('exit',code=>console.error('NATIVE_LIFECYCLE exit',code));
}
try {
  await whisper.initializeIfNeeded(options,{logLevel:'info'});
  const initializationSeconds=(performance.now()-start)/1000;
  for(const [method,key] of [['encodeSamples','encode'],['decodeTokens','decode']]) {
    const original=whisper.context[method].bind(whisper.context);
    whisper.context[method]=async (...args)=>{const t=performance.now();const r=await original(...args);metrics[`${key}Ms`]+=performance.now()-t;metrics[`${key}Calls`]++;if(method==='decodeTokens'&&args[1]===0){const v=whisper.context.getLogits();metrics.initialLogits.push({tokens:args[0].length,allZero:v.every(x=>x===0)});}return r;};
  }
  const alignStart=performance.now();
  const timeline=await whisper.align(input.audio,input.lyrics,language,'transcribe',options,{logLevel:'info'});
  const result={...input.metadata,benchmarkRunId:process.env.SONG_NATIVE_RUN_ID??null,backend:'official-windows-cpu',libPath,librarySha256:hash(await readFile(resolve(libPath,'whisper.dll'))),initializationSeconds,alignmentSeconds:(performance.now()-alignStart)/1000,totalSeconds:(performance.now()-start)/1000,metrics,timeline};
  await writeFile(resolve(out,'native.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({...result,timeline:`${timeline.length} words`}));
} finally {
  if(process.env.SONG_DIAGNOSTIC==='1')console.error('NATIVE_LIFECYCLE release begin');
  whisper.release();
  if(process.env.SONG_DIAGNOSTIC==='1')console.error('NATIVE_LIFECYCLE release returned');
}
