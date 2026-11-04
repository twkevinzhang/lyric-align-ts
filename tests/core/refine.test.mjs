import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suspectLines,suspectRuns,refineTimeline,REFINE} from '../../src/core/refine.mjs';
import {mapTimelineToCues} from '../../src/core/timeline-cues.mjs';

const word=(text,start,end)=>({text,startTime:start,endTime:end,confidence:1,timeline:[{text,startTime:start,endTime:end}]});
// Each line's characters share `length` seconds starting at `start`.
const line=(text,start,length)=>[...text].map((c,i,all)=>word(c,start+i*length/all.length,start+(i+1)*length/all.length));
const lines=['あいうえ','かきくけ','さしすせ','たちつて','なにぬね','はひふへ','まみむめ','やゆよわ'];
const healthy=lines.flatMap((text,i)=>line(text,i*5,4.5).map(w=>w));

test('healthy timing flags nothing and rejects a squeezed line',()=>{
 const cues=mapTimelineToCues(lines,healthy,45);
 assert.deepEqual(suspectLines(cues,healthy),lines.map(()=>false));
 const squeezed=[...healthy.slice(0,8),...line(lines[2],10,.2),...healthy.slice(12)];
 const flags=suspectLines(mapTimelineToCues(lines,squeezed,45),squeezed);
 assert.equal(flags[2],true);assert.equal(flags.filter(Boolean).length,1);
});
test('runs merge flagged lines separated by one gap only',()=>{
 assert.deepEqual(suspectRuns([false,true,false,true,false,false,false,true]),[[1,3],[7,7]]);
 assert.deepEqual(suspectRuns([true,true,false,false,true]),[[0,1],[4,4]]);
 assert.deepEqual(suspectRuns([false,false]),[]);
});
function shiftedSong(){ // lines 3 and 4 are squeezed against line 5, far from where they were sung
 return [...healthy.slice(0,12),...line(lines[3],24,.2),...line(lines[4],24.2,.2),...healthy.slice(20)];
}
test('a burst is re-aligned between its neighbours and the timeline is replaced',async()=>{
 const calls=[];
 const result=await refineTimeline({lines,words:shiftedSong(),audioSeconds:45,alignClip:async(from,to,clipLines)=>{
  calls.push({from,to,clipLines});
  // The clip contains the true timing of the lines, relative to its start.
  return healthy.filter(w=>w.startTime>=from-.01&&w.endTime<=to+.01).map(w=>({...w,startTime:w.startTime-from,endTime:w.endTime-from,timeline:w.timeline.map(t=>({...t,startTime:t.startTime-from,endTime:t.endTime-from}))}));
 }});
 assert.equal(calls.length,1);assert.deepEqual(calls[0].clipLines,lines.slice(2,6));
 assert.equal(result.refinedLines,2);assert.ok(result.flaggedLines>=2);
 const truth=mapTimelineToCues(lines,healthy,45);
 result.cues.forEach((cue,i)=>assert.ok(Math.abs(cue.start-truth[i].start)<1e-6,`line ${i}`));
});
test('result is kept when the neighbours move or the clip cannot be aligned',async()=>{
 const words=shiftedSong();
 const moved=await refineTimeline({lines,words,audioSeconds:45,alignClip:async(from,to)=>healthy.filter(w=>w.startTime>=from&&w.endTime<=to+.01).map(w=>({...w,startTime:w.startTime-from+2,endTime:w.endTime-from+2,timeline:undefined}))});
 assert.equal(moved.refinedLines,0);assert.deepEqual(moved.words,words);
 const failed=await refineTimeline({lines,words,audioSeconds:45,alignClip:async()=>undefined});
 assert.equal(failed.refinedLines,0);assert.equal(failed.attempts,REFINE.maxExpansion+1);
});
test('a song with more than a quarter of its lines flagged is left alone',async()=>{
 const squeezedAll=lines.flatMap((text,i)=>line(text,i*5,i<3?.2:4.5));
 let calls=0;
 const result=await refineTimeline({lines,words:squeezedAll,audioSeconds:45,alignClip:async()=>{calls++;return undefined}});
 assert.equal(calls,0);assert.equal(result.refinedLines,0);assert.ok(result.flaggedLines>lines.length*REFINE.maxFlaggedFraction);
});
