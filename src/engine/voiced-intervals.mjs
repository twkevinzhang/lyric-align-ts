// Research-only interval estimator. Evidence is integrated in seconds so the
// answer is independent of the VAD sampling rate. A one-second Gaussian prior
// retains each acoustic alignment anchor; no reference timestamps enter here.
export function voicedIntervals(anchors,probabilities,step,duration,mode='both'){
 if(!['both','ends'].includes(mode))throw Error('Invalid interval mode');
 if(!(step>0)||!(duration>0)||probabilities.length*step<duration-step||probabilities.some(p=>!Number.isFinite(p)||p<0||p>1))throw Error('Invalid voice evidence');
 if(anchors.some((a,i)=>!Number.isFinite(a.start)||!Number.isFinite(a.end)||a.start<0||a.end<a.start||a.end>duration||(i&&a.start<anchors[i-1].end)))throw Error('Invalid interval anchors');
 const cumulative=new Float64Array(probabilities.length+1);
 for(let i=0;i<probabilities.length;i++){
  const p=Math.max(1e-6,Math.min(1-1e-6,probabilities[i]));
  cumulative[i+1]=cumulative[i]+Math.log(p/(1-p))*step;
 }
 const centers=anchors.map(a=>(a.start+a.end)/2);
 return anchors.map((a,i)=>{
  const left=mode==='ends'?a.start:i?(centers[i-1]+centers[i])/2:0,right=mode==='ends'?(anchors[i+1]?.start??duration):i+1<anchors.length?(centers[i]+centers[i+1])/2:duration;
  const lo=Math.max(0,Math.ceil(left/step)),hi=Math.min(probabilities.length,Math.floor(right/step));
  if(hi<=lo)return {...a};
  let bestEntry=-Infinity,entry=lo,best=-Infinity,start=lo,end=lo+1;
  for(let t=lo+1;t<=hi;t++){
   const s=t-1,score=-cumulative[s]-(s*step-a.start)**2/2;
   if((mode==='both'||s===lo)&&score>bestEntry){bestEntry=score;entry=s;}
   const value=bestEntry+cumulative[t]-(t*step-a.end)**2/2;
   if(value>best){best=value;start=entry;end=t;}
  }
  return {start:mode==='ends'?a.start:start*step,end:Math.min(duration,end*step)};
 });
}
