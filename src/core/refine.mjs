import {mapTimelineToCues as timelineToCues} from './timeline-cues.mjs';
// Constants come from the cross-validated simulation on 17 Japanese songs plus
// the held-out 春泥棒 and SUNEO-ISM (strict feature detector, one-line expansion).
export const REFINE={meanTokenSeconds:.1,longestTokenSeconds:3,rateDeviation:1,maxFlaggedFraction:.25,runGap:1,maxExpansion:1,anchorTolerance:.5,clipMargin:.3,minClipSeconds:1};
const valid=cue=>cue.matched&&Number.isFinite(cue.start)&&Number.isFinite(cue.end);
const tokensOf=words=>words.flatMap(w=>w.timeline?.length?w.timeline:[w]).sort((a,b)=>a.startTime-b.startTime);
const median=values=>{const s=[...values].sort((x,y)=>x-y);return s[s.length>>1]};
// A burst of shifted lines shows up as squeezed or stretched lines: tokens
// stuck at the minimum step, one token held for seconds, or a speaking rate far
// from the song's own median. Reference timestamps are never consulted.
export function suspectLines(cues,words){
 const tokens=tokensOf(words),rate=cue=>(cue.end-cue.start)/Math.max(1,Array.from(cue.text.replace(/\s/g,'')).length);
 const typical=median(cues.filter(valid).map(rate));
 return cues.map(cue=>{
  if(!valid(cue))return false;
  const durations=tokens.filter(t=>t.startTime>=cue.start-1e-6&&t.startTime<cue.end-1e-6).map(t=>t.endTime-t.startTime);
  const mean=durations.length?durations.reduce((a,b)=>a+b,0)/durations.length:0,longest=durations.length?Math.max(...durations):0;
  return mean<REFINE.meanTokenSeconds||longest>REFINE.longestTokenSeconds||Math.abs(Math.log(rate(cue)/typical))>REFINE.rateDeviation;
 });
}
// Merge flagged lines separated by at most one unflagged line.
export function suspectRuns(flags){
 const runs=[],n=flags.length;let i=0;
 while(i<n){
  if(!flags[i]){i++;continue}
  let j=i;
  while(j+REFINE.runGap<n&&(flags[j+1]||flags[j+2]))j=flags[j+1]?j+1:j+2;
  runs.push([i,j]);i=j+1;
 }
 return runs;
}
const matchedCount=cues=>cues.filter(valid).length;
/**
 * Re-aligns each suspect run between the two lines on either side of it. A
 * result replaces the run only if both neighbours land where they already were.
 * `alignClip(start,end,lines)` returns a timeline relative to the clip, or
 * undefined when the clip could not be aligned.
 */
export async function refineTimeline({lines,words,audioSeconds,alignClip,onStep}){
 let current=words,cues=timelineToCues(lines,words,audioSeconds);
 const flags=suspectLines(cues,words),flagged=flags.filter(Boolean).length;
 const summary={flaggedLines:flagged,attempts:0,refinedLines:0};
 if(!flagged||flagged>cues.length*REFINE.maxFlaggedFraction)return{words,cues,...summary};
 const runs=suspectRuns(flags);let step=0;
 for(const [first,last] of runs){
  onStep?.(step++,runs.length);
  for(let expand=0;expand<=REFINE.maxExpansion;expand++){
   const a=Math.max(0,first-expand),b=Math.min(cues.length-1,last+expand),left=a>0,right=b+1<cues.length;
   const fi=left?a-1:0,lj=right?b+1:cues.length-1;
   if((left&&!valid(cues[fi]))||(right&&!valid(cues[lj])))continue;
   const from=left?Math.max(0,cues[fi].start-REFINE.clipMargin):0,to=right?Math.min(audioSeconds,cues[lj].end+REFINE.clipMargin):audioSeconds;
   if(to-from<REFINE.minClipSeconds)continue;
   const clipLines=lines.slice(left?fi:a,right?lj+1:b+1);
   summary.attempts++;
   const clip=await alignClip(from,to,clipLines);
   if(!clip)continue;
   const found=timelineToCues(clipLines,clip,to-from),lead=left?1:0,inner=found.slice(lead,lead+(b-a+1));
   if(left&&(!valid(found[0])||Math.abs(found[0].start+from-cues[fi].start)>REFINE.anchorTolerance))continue;
   if(right&&(!valid(found.at(-1))||Math.abs(found.at(-1).end+from-cues[lj].end)>REFINE.anchorTolerance))continue;
   if(!inner.every(valid))continue;
   const oldFrom=left?cues[fi].end:0,oldTo=right?cues[lj].start:audioSeconds,newFrom=left?found[0].end:0,newTo=right?found.at(-1).start:to-from;
   const merged=[...current.filter(w=>w.startTime<oldFrom-1e-6||w.startTime>=oldTo-1e-6),...shift(clip.filter(w=>w.startTime>=newFrom-1e-6&&w.startTime<newTo-1e-6),from)].sort((x,y)=>x.startTime-y.startTime);
   const remapped=timelineToCues(lines,merged,audioSeconds);
   if(matchedCount(remapped)<matchedCount(cues))continue;
   current=merged;cues=remapped;summary.refinedLines+=b-a+1;break;
  }
 }
 return{words:current,cues,...summary};
}
function shift(entries,seconds){
 return entries.map(entry=>({...entry,startTime:entry.startTime+seconds,endTime:entry.endTime+seconds,...(entry.timeline?{timeline:shift(entry.timeline,seconds)}:{})}));
}
