import {speculativeContext} from '../core/speculative-context.mjs';
import {vocabularySubset} from '../core/vocab-subset.mjs';
import {originalSpan} from '../core/audio-time-scale.mjs';
function collectKernels(module,profile,field){
 if(!profile||!module._poc_kernel_profile_ms)return;
 const labels=['q5Matmul','attentionF16','weightF16','otherMatmul','softmax','norm','unary','copies','addMul','im2col','other'];
 const counters=profile[field]??={};for(let i=0;i<labels.length;i++)counters[labels[i]]=(counters[labels[i]]??0)+module._poc_kernel_profile_ms(i);
}
export function nativeContext(module,pcm,virtual,progress,scale=2,profile,contextFrames){
  let latest,audioOffset=0;
  const context={
    get audioOffset(){return audioOffset;},
    async encodeSamples(samples){audioOffset=(samples.byteOffset-virtual.byteOffset)/4;const original=originalSpan(pcm,virtual,samples,scale);progress?.('encoding',audioOffset,virtual.length);if(contextFrames){const frames=Math.min(contextFrames,Math.max(32,Math.ceil(samples.length/2560)*8));if(module._poc_set_audio_context(frames))throw Error('Dynamic audio context rejected');if(profile)(profile.contextFrames??=[]).push(frames);}const ptr=module._malloc(original.byteLength);if(!ptr)throw Error('Audio allocation failed');try{module.HEAPU8.set(new Uint8Array(original.buffer,original.byteOffset,original.byteLength),ptr);if(profile)module._poc_kernel_profile_reset?.();if(module._poc_encode_samples(ptr,original.length))throw Error('Audio encoding failed');collectKernels(module,profile,'encoderKernels');if(profile){profile.melMs+=module._poc_mel_ms();profile.encoderMs+=module._poc_encoder_ms();profile.windows++;}}finally{module._free(ptr);}},
    async decodeTokens(tokens,past){const values=Int32Array.from(tokens),ptr=module._malloc(values.byteLength),dp=module._malloc(12);let qp;try{if(!ptr||!dp)throw Error('Decode allocation failed');module.HEAPU8.set(new Uint8Array(values.buffer),ptr);if(profile)module._poc_kernel_profile_reset?.();if(module._poc_decode(ptr,tokens.length,past>0?past-1:0))throw Error('Token decoding failed');collectKernels(module,profile,'decoderKernels');const count=module._poc_qk_dims(dp),dims=new Int32Array(module.HEAPU8.buffer,dp,3).slice();qp=module._malloc(count*4);if(count<=0||!qp||module._poc_qk_copy(qp,count))throw Error('Attention copy failed');latest={dimensions:Array.from(dims,BigInt),data:new Float32Array(module.HEAPU8.buffer,qp,count).slice()};}finally{if(qp)module._free(qp);module._free(dp);module._free(ptr);}},
    getLogits:()=>{const pointer=module._poc_logits();if(!pointer)throw Error('Logits unavailable in alignment-only mode');return new Float32Array(module.HEAPU8.buffer,pointer,module._poc_vocab()).slice();},
    getCrossAttentionQKs:async()=>latest,
  };
  if(profile){const decode=context.decodeTokens;context.decodeTokens=async(...args)=>{const start=performance.now();try{return await decode(...args);}finally{profile.decodeMs+=performance.now()-start;profile.batches++;profile.tokens+=args[0].length;}};}
  return context;
}
export function subset(module,tokens,eot,alignmentOnly=false){const ids=alignmentOnly?Int32Array.of(eot):vocabularySubset(tokens,eot,module._poc_vocab()),ptr=module._malloc(ids.byteLength);try{if(!ptr)throw Error('Vocabulary allocation failed');module.HEAPU8.set(new Uint8Array(ids.buffer),ptr);if(module._poc_set_vocab_subset(ptr,ids.length))throw Error('Vocabulary subset rejected');}finally{module._free(ptr);}}
export function speculativeNativeContext(module,original,remaining,eot,budget,batchSize=128){return speculativeContext(async(tokens,position)=>{await original.decodeTokens(tokens,position===0?0:position+1);const qk=await original.getCrossAttentionQKs();const[heads,count,frames]=qk.dimensions.map(Number);if(count!==tokens.length)throw Error('Unexpected batch attention dimensions');const vocab=module._poc_vocab(),base=module._poc_logits()-(count-1)*vocab*4;return tokens.map((_,row)=>{const data=new Float32Array(heads*frames);for(let h=0;h<heads;h++)data.set(qk.data.subarray((h*count+row)*frames,(h*count+row+1)*frames),h*frames);return{logits:new Float32Array(module.HEAPU8.buffer,base+row*vocab*4,vocab).slice(),qk:{dimensions:[BigInt(heads),1n,BigInt(frames)],data}};});},remaining,eot,batchSize,budget);}
