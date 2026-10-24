import {scoreCues} from './cue-score.mjs';
// Shared by the public API and optional worker-side boundary estimation.
export function mapTimelineToCues(lyrics,words,audioSeconds){
 const rows=scoreCues({timeline:words,audioSeconds},lyrics.map(text=>({text,start:0}))).rows;
 return rows.map(row=>{
  const issues=[];
  if(!row.usable)issues.push('unmatched-text');
  if(row.start===null||row.end===null||!Number.isFinite(row.start)||!Number.isFinite(row.end))issues.push('invalid-time');
  else{
   if(row.end===row.start)issues.push('zero-duration');
   if(row.end<row.start)issues.push('negative-duration');
   if(row.start<0||row.end>audioSeconds+1e-8)issues.push('out-of-bounds');
  }
  return {id:row.line,text:row.text,start:row.start,end:row.end,matched:row.usable,issues};
 });
}
