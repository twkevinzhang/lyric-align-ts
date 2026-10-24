// Research-only PCM evidence; no lyrics or reference times enter extraction.
export function acousticEnvelope(pcm){
 const hop=160,step=0.01,energy=new Float64Array(Math.ceil(pcm.length/hop));
 const lowDecay=Math.exp(-2*Math.PI*300/16000),highDecay=Math.exp(-2*Math.PI*3500/16000);
 let low=0,high=0;
 for(let i=0;i<pcm.length;i++){
  low=lowDecay*low+(1-lowDecay)*pcm[i];
  high=highDecay*high+(1-highDecay)*pcm[i];
  const band=high-low;energy[Math.floor(i/hop)]+=band*band/hop;
 }
 const prefix=new Float64Array(energy.length+1);
 for(let i=0;i<energy.length;i++)prefix[i+1]=prefix[i]+energy[i];
 const contrast=new Float64Array(energy.length);
 for(let i=10;i<energy.length-10;i++){
  const before=(prefix[i]-prefix[i-10])/10,after=(prefix[i+10]-prefix[i])/10;
  contrast[i]=Math.log((after+1e-10)/(before+1e-10));
 }
 return {step,energy,contrast};
}
export function snapAcousticBoundary(envelope,time,kind){
 const {contrast,step}=envelope,sign=kind==='start'?1:-1,radius=1.5;
 let selected=time,best=0;
 for(let i=Math.max(1,Math.ceil((time-radius)/step));i<Math.min(contrast.length-1,Math.floor((time+radius)/step)+1);i++){
  const evidence=sign*contrast[i];
  if(evidence<Math.log(2)||evidence<sign*contrast[i-1]||evidence<sign*contrast[i+1])continue;
  const score=evidence-Math.abs(i*step-time)/radius;
  if(score>best){best=score;selected=i*step;}
 }
 return selected;
}
