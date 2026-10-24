export function virtualAudio(pcm,scale){
  if(!Number.isFinite(scale)||scale<1||scale>4)throw Error('Time scale must be between 1 and 4');
  return pcm.subarray(0,Math.ceil(pcm.length/scale));
}
export function originalSpan(pcm,virtual,samples,scale){
  if(samples.buffer!==virtual.buffer)throw Error('Unexpected virtual PCM buffer');
  const offset=(samples.byteOffset-virtual.byteOffset)/4;
  if(offset<0||offset+samples.length>virtual.length)throw Error('Invalid virtual audio span');
  return pcm.subarray(offset*scale,(offset+samples.length)*scale);
}
export function scaleTimeline(timeline,scale,duration){
  for(const entry of timeline){
    entry.startTime=Math.min(duration,entry.startTime*scale);
    entry.endTime=Math.min(duration,entry.endTime*scale);
    if(entry.timeline)scaleTimeline(entry.timeline,scale,duration);
  }
}
