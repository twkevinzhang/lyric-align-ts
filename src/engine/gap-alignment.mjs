import {posteriorBoundaries} from './posterior-boundaries.mjs';
import {prefixEvidence} from './prefix-evidence.mjs';
import {removeAttentionBackground,geometricAttentionHeads} from './attention-background.mjs';
// Monotonic token/blank Viterbi. Each token owns >=1 frame; blanks own pauses.
// Returns half-open token intervals, unlike DTW's adjacent boundary convention.
export function gapAlignment(scores,{openEnd=false,blankAfter,onPrefix,entryScores,meanPrefixEvidence=false}={}){
 const tokens=scores.length,frames=scores[0]?.length??0,states=2*tokens+1;
 if(!tokens||!frames||(!openEnd&&tokens>frames)||scores.some(row=>row.length!==frames||row.some(x=>!Number.isFinite(x))))return;
 if(entryScores&&(entryScores.length!==tokens||entryScores.some(x=>!Number.isFinite(x))))throw Error('Invalid token entry scores');
 if(!scores.some(row=>row.some(x=>x>0)))return openEnd?[]:undefined;
 let previous=new Float64Array(states).fill(-Infinity);previous[0]=0;
 const trace=new Uint8Array(frames*states);
 for(let t=0;t<frames;t++){
  const next=new Float64Array(states).fill(-Infinity);
  for(let state=0;state<states;state++){
   if(state>0&&state%2===0&&blankAfter?.[state/2-1]===false)continue;
   let best=previous[state],step=0;
   const entry=state%2?(entryScores?.[(state-1)/2]??0):0;
   if(state>0&&previous[state-1]+entry>best){best=previous[state-1]+entry;step=1;}
   if(state%2===1&&state>1&&previous[state-2]+entry>best){best=previous[state-2]+entry;step=2;}
   next[state]=best+(state%2?scores[(state-1)/2][t]:0);
   trace[t*states+state]=step;
  }
  previous=next;
 }
 let state=previous[states-1]>=previous[states-2]?states-1:states-2;
 const evidence=openEnd&&meanPrefixEvidence?prefixEvidence(scores,{blankAfter,entryScores}):undefined;
 if(openEnd){
  state=0;
  for(let i=1;i<states;i++){
   // Equal evidence must not consume additional text; prefer blank for the
   // same consumed prefix so an unsupported tail does not extend the token.
   if(previous[i]>previous[state]||(previous[i]===previous[state]&&i%2===0&&Math.ceil(i/2)===Math.ceil(state/2)))state=i;
  }
  if(evidence){
   let chosen=0;
   for(let i=1;i<evidence.length;i++)if(evidence[i]>evidence[chosen])chosen=i;
   state=chosen?(previous[2*chosen]>=previous[2*chosen-1]?2*chosen:2*chosen-1):0;
  }
 }
 if(!Number.isFinite(previous[state]))return;
 if(onPrefix){
  const candidates=[];
  for(let n=0;n<=tokens;n++){
   const score=evidence?.[n]??(n?Math.max(previous[2*n],previous[2*n-1]):previous[0]);
   if(Number.isFinite(score))candidates.push({tokens:n,score});
  }
  candidates.sort((a,b)=>b.score-a.score||a.tokens-b.tokens);
  onPrefix({selected:openEnd?Math.ceil(state/2):tokens,frames,candidates:candidates.slice(0,5)});
 }
 const bounds=Array.from({length:openEnd?Math.ceil(state/2):tokens},()=>({start:frames,end:0}));
 for(let t=frames-1;t>=0;t--){
  if(state%2){const b=bounds[(state-1)/2];b.start=t;b.end=Math.max(b.end,t+1);}
  state-=trace[t*states+state];
 }
 return bounds;
}

// Evidence relative to uniform temporal attention and frame-wide common sinks.
// Existing QKs only: no additional encoder or decoder inference.
export function attentionGapBounds(qks,frames,stride=2,options={}){
 const count=qks.length,width=Math.ceil(frames/stride);
 if(!count||(!options.openEnd&&count>width)||qks.some(q=>!q))return;
 if(options.removeBackground)qks=removeAttentionBackground(qks,frames);
 if(options.geometricHeads)qks=geometricAttentionHeads(qks,frames);
 const probabilities=qks.map(q=>{
  const [heads,,sourceWidth]=q.dimensions.map(Number),weights=new Float64Array(width);
  const headRows=options.headConsensus?[]:undefined;
  for(let h=0;h<heads;h++){
   const row=new Float64Array(width);let maximum=-Infinity;
   for(let t=0;t<width;t++){
    let sum=0,n=0;
    for(let j=t*stride;j<Math.min(frames,(t+1)*stride);j++){sum+=q.data[h*sourceWidth+j];n++;}
    row[t]=sum/n;maximum=Math.max(maximum,row[t]);
   }
   let sum=0;for(let t=0;t<width;t++){row[t]=Math.exp(row[t]-maximum);sum+=row[t];}
   for(let t=0;t<width;t++){row[t]/=sum;weights[t]+=row[t]/heads;}
   headRows?.push(row);
  }
  if(headRows){
   let total=0;
   for(let t=0;t<width;t++){
    const values=headRows.map(row=>row[t]).sort((a,b)=>a-b),mid=Math.floor(heads/2);
    weights[t]=heads%2?values[mid]:(values[mid-1]+values[mid])/2;total+=weights[t];
   }
   if(total>0)for(let t=0;t<width;t++)weights[t]/=total;
  }
  return weights;
 });
 const frameMean=new Float64Array(width);
 for(const row of probabilities)for(let t=0;t<width;t++)frameMean[t]+=row[t]/count;
 const scores=probabilities.map(row=>Float32Array.from(row,(value,t)=>{
  const score=Math.log(Math.max(1e-12,value)/Math.max(1/width,count===1?0:frameMean[t]));
  // Numerical normalization noise is not positive acoustic evidence.
  return Math.abs(score)<1e-12?0:score;
 }));
 let bounds=gapAlignment(scores,options);
 const allocation=bounds;
 if(options.posterior&&bounds?.length){
  const expected=posteriorBoundaries(scores.slice(0,bounds.length),options)?.map(b=>({start:Math.round(b.start),end:Math.round(b.end)}));
  if(expected?.every((b,i)=>b.start>=0&&b.end>b.start&&b.end<=width&&(!i||b.start>=expected[i-1].end))){
   bounds=options.posterior==='ends'?bounds.map((b,i)=>({start:b.start,end:Math.max(b.start+1,Math.min(expected[i].end,bounds[i+1]?.start??width))})):expected;
  }
 }
 return bounds?.map((b,i)=>({start:b.start*stride,end:Math.min(frames,b.end*stride),...(options.posterior==='ends'?{allocationEnd:Math.min(frames,allocation[i].end*stride)}:{})}));
}
