let running=false;
self.onmessage=async({data:config})=>{
  if(running)return;running=true;
  let module;const profile=[];
  const log=(line)=>{if(String(line).startsWith('POCPROFILE '))profile.push(line);else console.log(line);};
  const post=async(path,body,headers={})=>{const r=await fetch(`${path}${path.includes('?')?'&':'?'}run=${config.runId}`,{method:'POST',body,headers});if(!r.ok)throw new Error(`${path}: ${r.status} ${await r.text()}`);};
  try{
    if(!self.crossOriginIsolated||typeof SharedArrayBuffer==='undefined')throw new Error('COOP/COEP and shared memory are required');
    self.postMessage('載入並驗證 small 多語模型');
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
      const data=await response.arrayBuffer();let output=new Uint8Array(0);const start=performance.now();
      if(command==='open'){
        if(module.ccall('poc_open','number',['string'],['/model.bin']))throw new Error('Open failed');module.FS.unlink('/model.bin');setThreads(config.threads);
      }else if(command==='threads'){
        setThreads(new Uint8Array(data)[0]);
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
      await post(`/reply?id=${id}`,output,{'X-Compute-Ms':String(performance.now()-start),'X-Mel-Ms':String(module._poc_mel_ms?.()??0),'X-Encoder-Ms':String(module._poc_encoder_ms?.()??0),'X-Threads':String(module._poc_get_threads?.()??1),'X-Heap-Bytes':String(module.HEAPU8.byteLength)});
      if(command==='close'){self.postMessage('完成');break;}
    }
  }catch(error){
    // Notify the coordinator before the UI terminates this worker and its children.
    try{await post('/error',String(error.stack));}finally{self.postMessage(`失敗：${error.stack}`);}
  }
};
