import {voicedIntervals} from './voiced-intervals.mjs';
// The model is loaded at initialization; every align creates fresh VAD state.
// PCM conversion, all VAD frames, and cue correction run inside align's clock.
export function voiceProbabilities(module,audio){
 const hop=256,pointers=[];let created=false;
 const allocate=n=>{const p=module._malloc(n);if(!p)throw Error('VAD allocation failed');pointers.push(p);return p;};
 let handle;
 try{
  handle=allocate(4);const input=allocate(hop*2),prob=allocate(4),flag=allocate(4);
  if(module._ten_vad_create(handle,hop,.5)!==0)throw Error('VAD initialization failed');created=true;
  const instance=module.HEAP32[handle/4],values=[];
  for(let offset=0;offset<audio.length;offset+=hop){
   const pcm=module.HEAP16.subarray(input/2,input/2+hop);pcm.fill(0);
   for(let i=0;i<Math.min(hop,audio.length-offset);i++){
    const x=Math.max(-1,Math.min(1,audio[offset+i]));pcm[i]=Math.round(x*(x<0?32768:32767));
   }
   if(module._ten_vad_process(instance,input,hop,prob,flag)!==0)throw Error('VAD inference failed');
   const p=module.HEAPF32[prob/4];if(!Number.isFinite(p)||p<0||p>1)throw Error('Invalid VAD probability');values.push(p);
  }
  return {values,step:hop/16000};
 }finally{if(created)module._ten_vad_destroy(handle);for(const p of pointers)module._free(p);}
}
export function correctVoicedCues(cues,signal,duration){
 // Preserve failures instead of inventing anchors for unmatched lyrics.
 if(cues.some(c=>!c.matched||c.issues.length||!Number.isFinite(c.start)||!Number.isFinite(c.end)))return cues;
 const intervals=voicedIntervals(cues.map(c=>({start:c.start,end:c.end})),signal.values,signal.step,duration,'ends');
 return cues.map((c,i)=>({...c,end:intervals[i].end}));
}
