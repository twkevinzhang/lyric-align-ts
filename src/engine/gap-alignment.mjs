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

// Same token/blank topology as gapAlignment, but token dwell time d is charged
// strength*ln(d/(rate*weight))^2 (semi-Markov), so a token cannot be squeezed
// to one frame or stretched over a pause. A token still holding the last frame
// of an open window may be truncated and is not charged. Returns undefined when
// no path exists; callers keep the plain alignment.
export function durationAlignment(scores,weights,{rate,strength,openEnd=false,blankAfter,entryScores}={}){
 const tokens=scores.length,frames=scores[0]?.length??0,states=2*tokens+1;
 if(!tokens||!frames||weights.length!==tokens||!(rate>0)||!(strength>0)||(!openEnd&&tokens>frames))return;
 const cumulative=scores.map(row=>{const sums=new Float64Array(frames+1);for(let t=0;t<frames;t++)sums[t+1]=sums[t]+row[t];return sums;});
 const value=new Float64Array((frames+1)*states).fill(-Infinity),start=new Int32Array((frames+1)*states),from=new Int32Array((frames+1)*states);
 value[0]=0;
 for(let b=1;b<=frames;b++){
  value[b*states]=0;
  for(let state=1;state<states;state++){
   const at=b*states+state;
   if(state%2===0){
    if(blankAfter?.[state/2-1]===false)continue;
    const stay=value[(b-1)*states+state],enter=value[(b-1)*states+state-1];
    if(enter>stay){value[at]=enter;start[at]=b-1;from[at]=state-1;}
    else if(stay>-Infinity){value[at]=stay;start[at]=start[(b-1)*states+state];from[at]=from[(b-1)*states+state];}
    continue;
   }
   const token=(state-1)/2,entry=entryScores?.[token]??0,expected=Math.max(1,rate*weights[token]);
   const longest=Math.min(b,Math.ceil(6*expected)+8);
   let best=-Infinity,bestStart=0,bestFrom=0;
   for(let d=1;d<=longest;d++){
    const a=b-d;
    let previous=value[a*states+state-1],source=state-1;
    if(state>1&&value[a*states+state-2]>previous){previous=value[a*states+state-2];source=state-2;}
    if(previous===-Infinity)continue;
    const deviation=Math.log(d/expected);
    const penalty=openEnd&&b===frames?0:strength*deviation*deviation;
    const candidate=previous+entry+cumulative[token][b]-cumulative[token][a]-penalty;
    if(candidate>best){best=candidate;bestStart=a;bestFrom=source;}
   }
   value[at]=best;start[at]=bestStart;from[at]=bestFrom;
  }
 }
 const last=frames*states;
 let state=openEnd?0:(value[last+states-1]>=value[last+states-2]?states-1:states-2);
 if(openEnd){
  for(let i=1;i<states;i++)if(value[last+i]>value[last+state]||(value[last+i]===value[last+state]&&i%2===0&&Math.ceil(i/2)===Math.ceil(state/2)))state=i;
 }
 if(!Number.isFinite(value[last+state]))return;
 const bounds=Array.from({length:openEnd?Math.ceil(state/2):tokens},()=>({start:frames,end:0}));
 let b=frames;
 while(state>0){
  const at=b*states+state,a=start[at];
  if(state%2){const bound=bounds[(state-1)/2];bound.start=a;bound.end=b;}
  state=from[at];b=a;
 }
 return bounds;
}
// Frames per weight unit, from an existing plain alignment.
export function durationRate(bounds,weights,minimumTokens=3){
 const rates=[];
 for(let i=0;i<bounds.length;i++)if(weights[i]>=1&&bounds[i].end>bounds[i].start)rates.push((bounds[i].end-bounds[i].start)/weights[i]);
 if(rates.length<minimumTokens)return;
 rates.sort((a,b)=>a-b);
 return Math.max(.5,rates[Math.floor((rates.length-1)/2)]);
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
 if(options.durationStrength>0&&options.durationWeights&&bounds?.length){
  const weights=options.durationWeights.slice(0,bounds.length),rate=weights.length===bounds.length?durationRate(bounds,weights):undefined;
  const refined=rate&&durationAlignment(scores.slice(0,bounds.length),weights,{...options,rate,strength:options.durationStrength});
  if(refined?.length===bounds.length)bounds=refined;
 }
 const allocation=bounds;
 if(options.posterior&&bounds?.length){
  const expected=posteriorBoundaries(scores.slice(0,bounds.length),options)?.map(b=>({start:Math.round(b.start),end:Math.round(b.end)}));
  if(expected?.every((b,i)=>b.start>=0&&b.end>b.start&&b.end<=width&&(!i||b.start>=expected[i-1].end))){
   bounds=options.posterior==='ends'?bounds.map((b,i)=>({start:b.start,end:Math.max(b.start+1,Math.min(expected[i].end,bounds[i+1]?.start??width))})):expected;
  }
 }
 return bounds?.map((b,i)=>({start:b.start*stride,end:Math.min(frames,b.end*stride),...(options.posterior==='ends'?{allocationEnd:Math.min(frames,allocation[i].end*stride)}:{})}));
}
