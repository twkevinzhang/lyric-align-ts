let running=false;
self.onmessage=async({data:config})=>{
  if(running)return;running=true;
  let module;const profile=[];
  const log=(line)=>{if(String(line).startsWith('POCPROFILE '))profile.push(line);else console.log(line);};
  const post=async(path,body,headers={})=>{const r=await fetch(`${path}${path.includes('?')?'&':'?'}run=${config.runId}`,{method:'POST',body,headers});if(!r.ok)throw new Error(`${path}: ${r.status} ${await r.text()}`);};
  try{
    if(!self.crossOriginIsolated||typeof SharedArrayBuffer==='undefined')throw new Error('COOP/COEP and shared memory are required');
    self.postMessage(`載入並驗證 ${config.model} 多語模型`);
    let model=await (await fetch('/model.bin')).arrayBuffer();
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',model)),b=>b.toString(16).padStart(2,'0')).join('');
    if(hash!==config.modelSha256)throw new Error('Model hash mismatch');
    importScripts('/wasm/parity.js');
    module=await createWhisperParity({noInitialRun:true,mainScriptUrlOrBlob:new URL('/wasm/parity.js',self.location.href).href,locateFile:name=>new URL(`/wasm/${name}`,self.location.href).href,print:log,printErr:log});
    module.FS.writeFile('/model.bin',new Uint8Array(model));model=null;
    const setThreads=n=>{
      if(!module._poc_set_threads){if(n!==1)throw new Error('This build supports only one inference thread');return;}
      if(module._poc_set_threads(n)||module._poc_get_threads()!==n)throw new Error('Thread setting failed');
    };
    await post('/start',JSON.stringify({userAgent:navigator.userAgent,crossOriginIsolated:self.crossOriginIsolated,modelSha256:hash,threads:config.threads,poolSize:config.poolSize,hardwareConcurrency:navigator.hardwareConcurrency,sharedMemory:module.HEAPU8.buffer instanceof SharedArrayBuffer}));
    for(;;){
      const response=await fetch(`/next?run=${config.runId}`);if(!response.ok)throw new Error('Command fetch failed');
      const command=response.headers.get('x-command'),id=response.headers.get('x-id'),past=Number(response.headers.get('x-past'));
      const data=await response.arrayBuffer();let output=new Uint8Array(0),decodeCalls=0;const start=performance.now();
      if(command==='open'){
        const modelSize={tiny:0,base:1,small:2}[config.model??'small'];
        const rc=module._poc_open_model?module.ccall('poc_open_model','number',['string','number'],['/model.bin',modelSize]):modelSize===2?module.ccall('poc_open','number',['string'],['/model.bin']):-1;
        if(rc)throw new Error('Open failed');module.FS.unlink('/model.bin');setThreads(config.threads);
        if(config.audioTimeScale!==1&&(!module._poc_set_time_scale||module._poc_set_time_scale(config.audioTimeScale)))throw Error('Time-scale build required');
        if(config.audioContextFrames!==1500&&(!module._poc_set_audio_context||module._poc_set_audio_context(config.audioContextFrames)))throw Error('Short-context build required');
      }else if(command==='threads'){
        setThreads(new Uint8Array(data)[0]);
      }else if(command==='guided'){
        setThreads(config.decoderThreads??config.threads);
        if(!self.runGuided)importScripts('/worker-decoder.js');
        const {packDecode}=await import('/decode-wire.mjs');
        const request=JSON.parse(new TextDecoder().decode(data));
        if(request.vocabSubset){
          if(!module._poc_set_vocab_subset)throw Error('Vocabulary subset build required');
          const {vocabularySubset}=await import('/vocab-subset.mjs');
          const ids=vocabularySubset(request.remainingTokens,request.specialTokens.endOfTextToken,module._poc_vocab());
          const ptr=module._malloc(ids.byteLength);
          try{if(!ptr)throw Error('Vocabulary allocation failed');module.HEAPU8.set(new Uint8Array(ids.buffer),ptr);if(module._poc_set_vocab_subset(ptr,ids.length))throw Error('Vocabulary subset rejected');}
          finally{module._free(ptr);}
        }
        let latest;
        let context={
          decodeTokens:async(tokens,past)=>{
            const values=Int32Array.from(tokens),ptr=module._malloc(values.byteLength),dp=module._malloc(12);
            let qp;
            try{
              if(!ptr||!dp)throw Error('Guided allocation failed');
              module.HEAPU8.set(new Uint8Array(values.buffer),ptr);
              const position=request.cachePolicy==='contiguous'&&past>0?past-1:past;
              if(module._poc_decode(ptr,tokens.length,position))throw Error('Guided decode failed');
              decodeCalls++;
              const count=module._poc_qk_dims(dp),dims=new Int32Array(module.HEAPU8.buffer,dp,3).slice();
              qp=module._malloc(count*4);
              if(count<=0||!qp||module._poc_qk_copy(qp,count))throw Error('Guided QK failed');
              latest={dimensions:Array.from(dims,BigInt),data:new Float32Array(module.HEAPU8.buffer,qp,count).slice()};
            }finally{if(qp)module._free(qp);module._free(dp);module._free(ptr);}
          },
          getLogits:()=>new Float32Array(module.HEAPU8.buffer,module._poc_logits(),module._poc_vocab()).slice(),
          getCrossAttentionQKs:async()=>latest,
        };
        if(request.speculativeBatch>1){
          const {speculativeContext}=await import('/speculative-context.mjs');
          const original=context;
          context=speculativeContext(async(tokens,position)=>{
            await original.decodeTokens(tokens,position===0?0:position+1);
            const qk=await original.getCrossAttentionQKs();
            const [heads,count,frames]=qk.dimensions.map(Number);
            if(count!==tokens.length)throw Error('Unexpected batch QK dimensions');
            const vocab=module._poc_vocab();
            const base=module._poc_logits()-(count-1)*vocab*4;
            return tokens.map((_,row)=>{
              const data=new Float32Array(heads*frames);
              for(let h=0;h<heads;h++)data.set(qk.data.subarray((h*count+row)*frames,(h*count+row+1)*frames),h*frames);
              return {logits:new Float32Array(module.HEAPU8.buffer,base+row*vocab*4,vocab).slice(),qk:{dimensions:[BigInt(heads),1n,BigInt(frames)],data}};
            });
          },request.remainingTokens,request.specialTokens.endOfTextToken,request.speculativeBatch,request.options.maxTokensPerPart);
        }
        let decoded=await self.runGuided(request,context);
        if(request.workerAlignment){
          if(!self.alignGuided)importScripts('/worker-alignment.js');
          const last=decoded.decodedTokens.at(-1),timestampStart=request.specialTokens.timestampTokensStart;
          const endOffset=!request.isFinalPart&&last>=timestampStart?request.audioOffset+Math.floor((last-timestampStart)*0.02*16000):Math.min(request.audioOffset+request.maxAudioSamplesPerPart,request.totalSamples);
          const frames=Math.floor((endOffset/16000-request.audioOffset/16000)/0.02);
          const count=request.initialTokens.length;
          decoded.alignmentPath=await self.alignGuided(decoded.decodedTokensCrossAttentionQKs.slice(count),decoded.decodedTokens.slice(count),0,frames);
          decoded.alignmentFrames=frames;
          if(request.attentionTrim&&!request.isFinalPart){
            const {trimAttentionPrefix}=await import('/attention-trim.mjs');
            decoded=trimAttentionPrefix(decoded,decoded.alignmentPath,count,frames-250,timestampStart,request.specialTokens.endOfTextToken);
          }
          decoded.decodedTokensCrossAttentionQKs=decoded.decodedTokens.map(()=>undefined);
        }
        output=packDecode(decoded);
        setThreads(config.threads);
      }else if(command==='encode'||command==='decode'){
        const ptr=module._malloc(data.byteLength);if(!ptr)throw new Error('Allocation failed');
        try{
          module.HEAPU8.set(new Uint8Array(data),ptr);
          if(command==='encode'){
            self.postMessage('Chrome WASM 正在處理音訊段落');
            if(module._poc_encode_samples(ptr,data.byteLength/4))throw new Error('Encode failed');
          }else{
            if(module._poc_decode(ptr,data.byteLength/4,past))throw new Error('Decode failed');
            const dp=module._malloc(12);let qp;
            try{
              const count=module._poc_qk_dims(dp);if(count<=0)throw new Error('QK dimensions failed');
              const dims=new Int32Array(module.HEAPU8.buffer,dp,3).slice(),vocab=module._poc_vocab();
              qp=module._malloc(count*4);if(!qp)throw new Error('QK allocation failed');
              if(module._poc_qk_copy(qp,count))throw new Error('QK copy failed');
              output=new Uint8Array(16+(vocab+count)*4);
              new Uint32Array(output.buffer,0,4).set([...dims,vocab]);
              output.set(module.HEAPU8.subarray(module._poc_logits(),module._poc_logits()+vocab*4),16);
              output.set(module.HEAPU8.subarray(qp,qp+count*4),16+vocab*4);
            }finally{if(qp)module._free(qp);module._free(dp);}
          }
        }finally{module._free(ptr);}
      }else if(command==='close'){module._poc_close();if(profile.length)await post('/profile',JSON.stringify(profile));}
      else throw new Error(`Unknown command ${command}`);
      await post(`/reply?id=${id}`,output,{'X-Compute-Ms':String(performance.now()-start),'X-Decode-Calls':String(decodeCalls),'X-Mel-Ms':String(module._poc_mel_ms?.()??0),'X-Encoder-Ms':String(module._poc_encoder_ms?.()??0),'X-Threads':String(module._poc_get_threads?.()??1),'X-Heap-Bytes':String(module.HEAPU8.byteLength)});
      if(command==='close'){self.postMessage('完成');break;}
    }
  }catch(error){
    // Notify the coordinator before the UI terminates this worker and its children.
    try{await post('/error',String(error.stack));}finally{self.postMessage(`失敗：${error.stack}`);}
  }
};
