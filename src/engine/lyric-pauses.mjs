import {normalize} from '../core/score.mjs';
// Text only. If tokenization changes the text, decline the structural prior.
export function lyricPauseMask(tokens,decode,lyrics){
 const lines=lyrics.split(/\r?\n/).map(normalize).filter(Boolean);
 const target=lines.join(''),ends=new Set();let length=0;
 for(const line of lines){length+=line.length;ends.add(length);}
 const mask=[];let pending=[],text='';
 for(const token of tokens){
  pending.push(token);const decoded=decode(pending);
  if(decoded.includes('\uFFFD')){mask.push(false);continue;}
  text+=normalize(decoded);pending=[];
  mask.push(ends.has(text.length));
 }
 return pending.length||text!==target?undefined:mask;
}
