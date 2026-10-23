// Keep UTF-8 token fragments together without merging adjacent lyric lines.
export function tokenTextUnits(words,decode,isText){
  const output=[];let pending=[];
  for(const token of words.flatMap(w=>w.timeline??[w])){
    if(!isText(token.id))continue;
    pending.push(token);
    const text=decode(pending.map(t=>t.id));
    if(text.includes('\uFFFD'))continue;
    if(text.trim())output.push({type:'word',text:text.trim(),startTime:pending[0].startTime,endTime:pending.at(-1).endTime,confidence:pending.some(t=>t.confidence===0)?0:1,timeline:pending});
    pending=[];
  }
  if(pending.length)output.push({type:'word',text:decode(pending.map(t=>t.id)),startTime:pending[0].startTime,endTime:pending.at(-1).endTime,confidence:0,timeline:pending});
  return output;
}
