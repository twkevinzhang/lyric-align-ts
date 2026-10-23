import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {prepare,official,options,out,local,lock,hash,threadSettings,language,inference,cachePolicy,decoderThreads,audioTimeScale,echo} from './common.mjs';
import {virtualAudio,originalSpan,scaleTimeline} from './audio-time-scale.mjs';
import {cachePosition} from './cache-position.mjs';
import {workerDecoderSource} from './worker-decoder-source.mjs';
import {workerAlignmentSource} from './worker-alignment-source.mjs';
import {unpackDecode} from './decode-wire.mjs';
import {mapRecognizedLyrics} from './recognition-map.mjs';
import {naturalJapaneseSpacing} from './lyrics.mjs';
import {tokenTextUnits} from './token-units.mjs';
import {loadContextWhisper} from './context-source.mjs';
import {lookaheadBudget} from './attention-trim.mjs';
const input=await prepare();
const audioContextFrames=Number(process.env.SONG_AUDIO_CONTEXT??'1500');
if(![375,750,1500].includes(audioContextFrames))throw Error('Invalid audio context');
const contextModule=await loadContextWhisper(echo,local,audioContextFrames);
const {Whisper}=contextModule;
Object.assign(input.metadata,{audioContextFrames,contextSourceSha256:contextModule.sourceSha256});
const vectors=await official('math/VectorMath.js');
const decoderSource=workerDecoderSource(Whisper,vectors);
const alignmentSource=workerAlignmentSource(Whisper,vectors,await readFile(resolve(echo,'dist/alignment/DTWSequenceAlignmentWindowed.js'),'utf8'),await readFile(resolve(echo,'dist/math/MedianFilter.js'),'utf8'));
const workerAlignment=process.env.SONG_WORKER_ALIGNMENT==='1';
const timestampTokens=process.env.SONG_TIMESTAMP_TOKENS!=='0';
const attentionTrim=process.env.SONG_ATTENTION_TRIM==='1';
const lookaheadRatio=Number(process.env.SONG_LOOKAHEAD_RATIO??'1.5');
if(!Number.isFinite(lookaheadRatio)||lookaheadRatio<1||lookaheadRatio>2)throw Error('Invalid lookahead ratio');
if(attentionTrim&&(!workerAlignment||timestampTokens||audioContextFrames!==1500))throw Error('Attention trimming requires full-context Worker DTW without timestamp decoding');
const japaneseSpacing=process.env.SONG_JAPANESE_SPACING??'upstream';
if(!['upstream','natural'].includes(japaneseSpacing))throw Error('Invalid Japanese spacing policy');
const decodeLocation=process.env.SONG_DECODE_LOCATION??'node';
const alignmentMode=process.env.SONG_ALIGNMENT_MODE??'guided';
if(workerAlignment&&decodeLocation!=='worker')throw Error('Worker alignment requires Worker decoder');
const speculativeBatch=Number(process.env.SONG_SPECULATIVE_BATCH??'1');
const vocabSubset=process.env.SONG_VOCAB_SUBSET==='1';
if(vocabSubset&&(decodeLocation!=='worker'||alignmentMode!=='guided'))throw Error('Vocabulary subset requires guided Worker decode');
if(!Number.isInteger(speculativeBatch)||speculativeBatch<1||speculativeBatch>256)throw Error('Invalid speculative batch');
if(speculativeBatch>1&&(decodeLocation!=='worker'||cachePolicy!=='contiguous'||alignmentMode!=='guided'))throw Error('Speculation requires contiguous guided Worker decode');
if(!['guided','recognize-map'].includes(alignmentMode))throw Error('Unknown alignment mode');
if(!['node','worker'].includes(decodeLocation))throw Error('Unknown decoder location');
Object.assign(input.metadata,{decodeLocation,alignmentMode,speculativeBatch,workerTokenBudget:inference.workerTokenBudget,decoderSourceSha256:hash(Buffer.from(decoderSource))});
input.metadata.vocabSubset=vocabSubset;
Object.assign(input.metadata,{workerAlignment,alignmentSourceSha256:hash(Buffer.from(alignmentSource))});
input.metadata.japaneseSpacing=japaneseSpacing;
input.metadata.timestampTokens=timestampTokens;
input.metadata.attentionTrim=attentionTrim;
input.metadata.lookaheadRatio=lookaheadRatio;
input.metadata.mode=alignmentMode==='recognize-map'?'recognition-mapped-lyrics':'guided-lyrics-alignment';
const port=5174, origin=`http://127.0.0.1:${port}`,runId=randomUUID();
const variant=process.env.SONG_WASM_BUILD || 'wasm';
if(!['wasm','compact12','experimental12','timescale12'].includes(variant))throw new Error('Unknown WASM build');
if(speculativeBatch>1&&variant!=='timescale12')throw Error('Speculation requires timescale12 build with all batch logits');
if(vocabSubset&&variant!=='timescale12')throw Error('Vocabulary subset requires timescale12');
const calibrate=process.env.SONG_MODE==='calibrate';
if(audioContextFrames!==1500&&(variant!=='timescale12'||calibrate))throw Error('Short audio context requires timescale12 full-song mode');
const calibrationThreads=(process.env.SONG_CALIBRATE_THREADS||'1,2,4,6').split(',').map(Number);
const calibrationWarmupCount=Number(process.env.SONG_CALIBRATE_WARMUP||'0');
if(!Number.isInteger(calibrationWarmupCount)||calibrationWarmupCount<0||calibrationWarmupCount>=calibrationThreads.length)throw new Error('Invalid warmup count');
if(calibrationThreads.some(n=>!Number.isInteger(n)||n<1||n>threadSettings.poolSize))throw new Error('Invalid calibration counts');
const buildDirectory=resolve(local,`build-song-${variant}`);
const buildCache=await readFile(resolve(buildDirectory,'CMakeCache.txt'),'utf8');
const builtPool=Number(/^POC_PTHREAD_POOL_SIZE:STRING=(\d+)\r?$/m.exec(buildCache)?.[1]);
if(builtPool!==threadSettings.poolSize)throw new Error('Configured worker pool does not match compiled pool');
const buildHashes={js:hash(await readFile(resolve(buildDirectory,'parity.js'))),wasm:hash(await readFile(resolve(buildDirectory,'parity.wasm')))};
const optimization=variant!=='wasm'?JSON.parse(await readFile(resolve(local,'compact-source.json'))):null;
if(variant==='timescale12')optimization.timeScale=JSON.parse(await readFile(resolve(local,'timescale-source.json')));
let pending,waiter,started=false,status='等待 Chrome 執行',result,cancelled=false;
const metrics={encodeMs:0,decodeMs:0,encodeCalls:0,decodeCalls:0,rpcMs:0,melMs:0,encoderOnlyMs:0,peakObservedHeapBytes:0,calls:[]};
let sequence=0;
function dispatch(){if(pending&&waiter){const response=waiter;waiter=undefined;response.writeHead(200,{'Content-Type':'application/octet-stream','X-Command':pending.method,'X-Id':String(pending.id),'X-Past':String(pending.past||0)});response.end(pending.bytes);}}
function rpc(method,bytes=Buffer.alloc(0),past=0){
  if(cancelled)throw new Error('Run cancelled');
  if(pending)throw new Error('Only sequential inference supported');
  return new Promise((resolve,reject)=>{const t=performance.now();const timeout=setTimeout(()=>{pending=undefined;reject(new Error(`${method} timed out`));},15*60*1000);pending={id:++sequence,method,bytes,past,reject:(e)=>{clearTimeout(timeout);reject(e);},resolve:(x)=>{clearTimeout(timeout);metrics.rpcMs+=performance.now()-t;resolve(x);}};dispatch();});
}
function f32(bytes,offset=0,length=(bytes.length-offset)/4){const a=new Float32Array(length);for(let i=0;i<length;i++)a[i]=bytes.readFloatLE(offset+i*4);return a;}
async function run(browserInfo){
  const start=performance.now();
  const whisper=new Whisper(inference.model,input.modelPath,'browser');
  const virtual=virtualAudio(input.audio.audioChannels[0],audioTimeScale);
  const alignmentAudio={...input.audio,audioChannels:[virtual]};
  let logits,qk,audioOffset=0,workerPath;
  try {
    if(!browserInfo.crossOriginIsolated||browserInfo.threads!==options.threadCount||!browserInfo.sharedMemory)throw new Error('Browser thread/isolation contract mismatch');
    await whisper.initializeTokenizerIfNeeded({logLevel:'info'});
    await rpc('open');
    const initializationSeconds=(performance.now()-start)/1000;
    if(calibrate){
      const pcm=input.audio.audioChannels[0].subarray(0,480000),bytes=Buffer.from(pcm.buffer,pcm.byteOffset,pcm.byteLength);
      const measurements=[];
      for(const [index,threads] of calibrationThreads.entries()){
        status=`校準 ${variant} / ${threads} threads`;
        await rpc('threads',Buffer.from([threads]));
        const t=performance.now();await rpc('encode',bytes);
        measurements.push({threads,warmup:index<calibrationWarmupCount,wallMs:performance.now()-t,...metrics.calls.at(-1)});
        await writeFile(resolve(out,'calibration-progress.json'),JSON.stringify(measurements,null,2));
      }
      await rpc('close');
      result={...input.metadata,variant,buildHashes,optimization,browserInfo,calibrationPcmSha256:hash(bytes),secondsTested:30,calibrationWarmupCount,measurements};
      await writeFile(resolve(out,'calibration.json'),JSON.stringify(result,null,2));status='完成：執行緒校準';return;
    }
    whisper.context={
      encodeSamples:async(samples,threads)=>{audioOffset=(samples.byteOffset-virtual.byteOffset)/4;samples=originalSpan(input.audio.audioChannels[0],virtual,samples,audioTimeScale);if(threads!==options.threadCount)throw new Error('Thread mismatch');status=`推論第 ${metrics.encodeCalls+1} 段音訊`;await rpc('encode',Buffer.from(samples.buffer,samples.byteOffset,samples.byteLength));},
      decodeTokens:async(tokens,past,threads)=>{if(threads!==options.threadCount)throw new Error('Thread mismatch');const a=Int32Array.from(tokens);const bytes=await rpc('decode',Buffer.from(a.buffer),cachePosition(past,cachePolicy));const dims=[bytes.readUInt32LE(0),bytes.readUInt32LE(4),bytes.readUInt32LE(8)],vocab=bytes.readUInt32LE(12);if(vocab!==51865||dims[0]!==inference.heads||dims[2]!==audioContextFrames)throw new Error('Unexpected dimensions');if(bytes.length!==16+4*(vocab+dims.reduce((a,b)=>a*b,1)))throw new Error('Invalid decode payload');logits=f32(bytes,16,vocab);qk={dimensions:dims.map(BigInt),data:f32(bytes,16+vocab*4)};},
      getLogits:()=>logits.slice(),getCrossAttentionQKs:async()=>qk,release:()=>{},
    };
    if(decodeLocation==='worker'){
      let lyricTokens,consumed=0;
      const tokenize=whisper.textToTokens.bind(whisper);
      whisper.textToTokens=text=>{const tokens=tokenize(japaneseSpacing==='natural'&&language==='ja'?naturalJapaneseSpacing(text):text);if(!lyricTokens&&text!==' ')lyricTokens=tokens;return tokens;};
      whisper.decodeTokens=async(initialTokens,audioDuration,isFirstPart,isFinalPart,decodeOptions,logitFilter)=>{
        const guided=!!logitFilter;
        if(guided&&!lyricTokens)throw Error('Lyrics were not tokenized before decode');
        // Upstream recognize clamps to 220 even when align requests 448.
        // Keep room for the prompt within the actual 448-token context.
        decodeOptions={...decodeOptions,maxTokensPerPart:Math.min(inference.workerTokenBudget,448-initialTokens.length)};
        const request={initialTokens,audioDuration,isFirstPart,isFinalPart,options:decodeOptions,guided,remainingTokens:lyricTokens?.slice(consumed)??[],specialTokens:whisper.specialTokens,suppressedMetadataTokens:whisper.getSuppressedMetadataTokens(),suppressedTextTokens:whisper.getSuppressedTextTokens(),spaceToken:tokenize(' ')[0],cachePolicy};
        request.speculativeBatch=speculativeBatch;
        request.vocabSubset=vocabSubset;
        request.attentionTrim=attentionTrim;
        if(attentionTrim)request.options.maxTokensPerPart=lookaheadBudget(lyricTokens.length,virtual.length,audioDuration,request.remainingTokens.length,isFinalPart,request.options.maxTokensPerPart,lookaheadRatio);
        Object.assign(request,{workerAlignment,audioOffset,totalSamples:virtual.length,maxAudioSamplesPerPart:audioContextFrames*320});
        const decoded=unpackDecode(await rpc('guided',Buffer.from(JSON.stringify(request))));
        if(workerAlignment)workerPath={path:decoded.alignmentPath,frames:decoded.alignmentFrames,tokens:decoded.decodedTokens.slice(initialTokens.length)};
        consumed+=decoded.decodedTokens.slice(initialTokens.length).filter(t=>whisper.isTextToken(t)).length;
        return decoded;
      };
      if(workerAlignment)whisper.findAlignmentPathFromCrossAttentionQKs=async(qks,tokens,start,end)=>{
        if(!workerPath||start!==0||end!==workerPath.frames||JSON.stringify(tokens)!==JSON.stringify(workerPath.tokens))throw Error('Worker alignment boundary mismatch');
        const path=workerPath.path;workerPath=undefined;return path;
      };
    }
    const alignStart=performance.now();
    if(!timestampTokens){
      const recognize=whisper.recognize.bind(whisper);
      whisper.recognize=(audio,task,language,decodeOptions,...rest)=>recognize(audio,task,language,{...decodeOptions,decodeTimestampTokens:false},...rest);
    }
    let timeline,recognized;
    if(alignmentMode==='recognize-map'){
      recognized=await whisper.recognize(alignmentAudio,'transcribe',language,{...options,temperature:0,topCandidateCount:1,punctuationThreshold:Infinity,autoPromptParts:true,suppressRepetition:false,repetitionThreshold:Infinity,decodeTimestampTokens:true,includeEndTokenInCandidates:false},undefined,{logLevel:'info'});
      timeline=mapRecognizedLyrics(input.lyrics,recognized.timeline,input.metadata.audioSeconds/audioTimeScale);
    }else timeline=await whisper.align(alignmentAudio,input.lyrics,language,'transcribe',options,{logLevel:'info'});
    if(japaneseSpacing==='natural'&&language==='ja')timeline=tokenTextUnits(timeline,tokens=>whisper.tokensToText(tokens),token=>whisper.isTextToken(token));
    scaleTimeline(timeline,audioTimeScale,input.metadata.audioSeconds);
    const completed={...input.metadata,backend:'chrome-wasm-node-orchestrator',variant,buildHashes,optimization,runId,browserInfo,initializationSeconds,alignmentSeconds:(performance.now()-alignStart)/1000,totalSeconds:(performance.now()-start)/1000,metrics,timeline,recognized};
    await rpc('close');
    await writeFile(resolve(out,'wasm.json'),JSON.stringify(completed,null,2));result=completed;
    status=`完成：${timeline.length} 個詞，${result.totalSeconds.toFixed(2)} 秒`;
    console.log(status);
  }catch(error){status=`失敗：${error.stack}`;console.error(error);await writeFile(resolve(out,'wasm-error.json'),JSON.stringify({status,metrics}));}
}
const routes=new Map([
  ['/',[resolve(import.meta.dirname,'index.html'),'text/html']],
  ['/worker.js',[resolve(import.meta.dirname,'worker.js'),'text/javascript']],
  ['/decode-wire.mjs',[resolve(import.meta.dirname,'decode-wire.mjs'),'text/javascript']],
  ['/speculative-context.mjs',[resolve(import.meta.dirname,'speculative-context.mjs'),'text/javascript']],
  ['/vocab-subset.mjs',[resolve(import.meta.dirname,'vocab-subset.mjs'),'text/javascript']],
  ['/attention-trim.mjs',[resolve(import.meta.dirname,'attention-trim.mjs'),'text/javascript']],
  ['/model.bin',[input.modelPath,'application/octet-stream']],
  ['/wasm/parity.js',[resolve(buildDirectory,'parity.js'),'text/javascript']],
  ['/wasm/parity.wasm',[resolve(buildDirectory,'parity.wasm'),'application/wasm']],
]);
const server=createServer(async(req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cache-Control','no-store');
  try{
    if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403).end();return;}
    const url=new URL(req.url,origin),route=routes.get(url.pathname);
    if(req.method==='GET'&&url.pathname==='/worker-decoder.js'){res.setHeader('Content-Type','text/javascript');res.end(decoderSource);return;}
    if(req.method==='GET'&&url.pathname==='/worker-alignment.js'){res.setHeader('Content-Type','text/javascript');res.end(alignmentSource);return;}
    if(['GET','HEAD'].includes(req.method)&&route){res.setHeader('Content-Type',route[1]);res.end(req.method==='HEAD'?undefined:await readFile(route[0]));return;}
    if(req.method==='GET'&&url.pathname==='/status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status,metrics,complete:!!result}));return;}
    if(req.method==='GET'&&url.pathname==='/config'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({runId,modelSha256:inference.sha256,model:inference.model,modelPrecision:inference.precision,decodeLocation,workerAlignment,threads:options.threadCount,poolSize:threadSettings.poolSize,decoderThreads,audioTimeScale,audioContextFrames,variant,calibrate}));return;}
    if(url.searchParams.get('run')!==runId){res.writeHead(403).end();return;}
    if(req.method==='GET'&&url.pathname==='/next'){if(waiter)throw new Error('Duplicate worker');waiter=res;res.on('close',()=>{if(waiter===res)waiter=undefined;});dispatch();return;}
    if(req.method!=='POST'||req.headers.origin!==origin){res.writeHead(403).end();return;}
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>32*1024*1024)throw new Error('Payload too large');chunks.push(chunk);}const bytes=Buffer.concat(chunks);
    if(url.pathname==='/profile'){await writeFile(resolve(out,'operations.json'),bytes);res.end('ok');return;}
    if(url.pathname==='/start'){if(started)throw new Error('Already started');started=true;res.end('ok');void run(JSON.parse(bytes));return;}
    if(url.pathname==='/reply'){
      if(!pending||String(pending.id)!==url.searchParams.get('id'))throw new Error('Unexpected reply');
      const ms=Number(req.headers['x-compute-ms']);if(!Number.isFinite(ms)||ms<0)throw new Error('Invalid duration');
      const melMs=Number(req.headers['x-mel-ms']),encoderMs=Number(req.headers['x-encoder-ms']),threads=Number(req.headers['x-threads']);
      if(pending.method==='encode'&&(!Number.isFinite(melMs)||!Number.isFinite(encoderMs)||melMs<0||encoderMs<0||!Number.isInteger(threads)||threads<1||threads>threadSettings.poolSize))throw new Error('Invalid encoder metrics');
      const current=pending;pending=undefined;
      metrics.peakObservedHeapBytes=Math.max(metrics.peakObservedHeapBytes,Number(req.headers['x-heap-bytes']||0));
      if(['encode','decode'].includes(current.method)){metrics[`${current.method}Ms`]+=ms;metrics[`${current.method}Calls`]++;}
      if(current.method==='guided'){metrics.decodeMs+=ms;metrics.decodeCalls+=Number(req.headers['x-decode-calls']);}
      if(current.method==='encode'){
        metrics.melMs+=melMs;metrics.encoderOnlyMs+=encoderMs;metrics.calls.push({computeMs:ms,melMs,encoderMs,threads});
      }
      res.end('ok');current.resolve(bytes);return;
    }
    if(url.pathname==='/error'||url.pathname==='/cancel'){cancelled=true;status=`失敗：${bytes.toString()}`;pending?.reject(new Error(status));pending=undefined;if(waiter){waiter.writeHead(410).end();waiter=undefined;}console.error(status);res.end('ok');return;}
    res.writeHead(404).end();
  }catch(error){console.error(error);res.writeHead(500).end(String(error));}
});
server.listen(port,'127.0.0.1',()=>console.log(`${origin} runId=${runId}`));
