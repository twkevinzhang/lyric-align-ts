import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {prepare,official,options,out,local,lock,hash,threadSettings,language} from './common.mjs';
const input=await prepare();
const {Whisper}=await official('recognition/WhisperSTT.js');
const port=5174, origin=`http://127.0.0.1:${port}`,runId=randomUUID();
const variant=process.env.SONG_WASM_BUILD || 'wasm';
if(!['wasm','compact12'].includes(variant))throw new Error('Unknown WASM build');
const calibrate=process.env.SONG_MODE==='calibrate';
const calibrationThreads=(process.env.SONG_CALIBRATE_THREADS||'1,2,4,6').split(',').map(Number);
const calibrationWarmupCount=Number(process.env.SONG_CALIBRATE_WARMUP||'0');
if(!Number.isInteger(calibrationWarmupCount)||calibrationWarmupCount<0||calibrationWarmupCount>=calibrationThreads.length)throw new Error('Invalid warmup count');
if(calibrationThreads.some(n=>!Number.isInteger(n)||n<1||n>threadSettings.poolSize))throw new Error('Invalid calibration counts');
const buildDirectory=resolve(local,`build-song-${variant}`);
const buildCache=await readFile(resolve(buildDirectory,'CMakeCache.txt'),'utf8');
const builtPool=Number(/^POC_PTHREAD_POOL_SIZE:STRING=(\d+)\r?$/m.exec(buildCache)?.[1]);
if(builtPool!==threadSettings.poolSize)throw new Error('Configured worker pool does not match compiled pool');
const buildHashes={js:hash(await readFile(resolve(buildDirectory,'parity.js'))),wasm:hash(await readFile(resolve(buildDirectory,'parity.wasm')))};
const optimization=variant==='compact12'?JSON.parse(await readFile(resolve(local,'compact-source.json'))):null;
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
  const whisper=new Whisper('small',input.modelPath,'browser');
  let logits,qk;
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
      encodeSamples:async(samples,threads)=>{if(threads!==options.threadCount)throw new Error('Thread mismatch');status=`推論第 ${metrics.encodeCalls+1} 段音訊`;await rpc('encode',Buffer.from(samples.buffer,samples.byteOffset,samples.byteLength));},
      decodeTokens:async(tokens,past,threads)=>{if(threads!==options.threadCount)throw new Error('Thread mismatch');const a=Int32Array.from(tokens);const bytes=await rpc('decode',Buffer.from(a.buffer),past);const dims=[bytes.readUInt32LE(0),bytes.readUInt32LE(4),bytes.readUInt32LE(8)],vocab=bytes.readUInt32LE(12);if(vocab!==51865||dims[0]!==10||dims[2]!==1500)throw new Error('Unexpected dimensions');if(bytes.length!==16+4*(vocab+dims.reduce((a,b)=>a*b,1)))throw new Error('Invalid decode payload');logits=f32(bytes,16,vocab);qk={dimensions:dims.map(BigInt),data:f32(bytes,16+vocab*4)};},
      getLogits:()=>logits.slice(),getCrossAttentionQKs:async()=>qk,release:()=>{},
    };
    const alignStart=performance.now();
    const timeline=await whisper.align(input.audio,input.lyrics,language,'transcribe',options,{logLevel:'info'});
    const completed={...input.metadata,backend:'chrome-wasm-node-orchestrator',variant,buildHashes,optimization,runId,browserInfo,initializationSeconds,alignmentSeconds:(performance.now()-alignStart)/1000,totalSeconds:(performance.now()-start)/1000,metrics,timeline};
    await rpc('close');
    await writeFile(resolve(out,'wasm.json'),JSON.stringify(completed,null,2));result=completed;
    status=`完成：${timeline.length} 個詞，${result.totalSeconds.toFixed(2)} 秒`;
    console.log(status);
  }catch(error){status=`失敗：${error.stack}`;console.error(error);await writeFile(resolve(out,'wasm-error.json'),JSON.stringify({status,metrics}));}
}
const routes=new Map([
  ['/',[resolve(import.meta.dirname,'index.html'),'text/html']],
  ['/worker.js',[resolve(import.meta.dirname,'worker.js'),'text/javascript']],
  ['/model.bin',[input.modelPath,'application/octet-stream']],
  ['/wasm/parity.js',[resolve(buildDirectory,'parity.js'),'text/javascript']],
  ['/wasm/parity.wasm',[resolve(buildDirectory,'parity.wasm'),'application/wasm']],
]);
const server=createServer(async(req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cache-Control','no-store');
  try{
    if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403).end();return;}
    const url=new URL(req.url,origin),route=routes.get(url.pathname);
    if(['GET','HEAD'].includes(req.method)&&route){res.setHeader('Content-Type',route[1]);res.end(req.method==='HEAD'?undefined:await readFile(route[0]));return;}
    if(req.method==='GET'&&url.pathname==='/status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status,metrics,complete:!!result}));return;}
    if(req.method==='GET'&&url.pathname==='/config'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({runId,modelSha256:lock.model.sha256,threads:options.threadCount,poolSize:threadSettings.poolSize,variant,calibrate}));return;}
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
