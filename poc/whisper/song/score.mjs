export const normalize=text=>text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function linesFromWords(lyrics,words,duration){
  const expected=lyrics.map(normalize).join(''),actual=words.map(w=>normalize(w.text)).join('');
  if(!expected||expected!==actual)throw new Error('Transcript does not exactly cover the supplied lyrics in order');
  let wordOffset=0;const spans=words.map(w=>{const start=wordOffset;wordOffset+=normalize(w.text).length;return{...w,charStart:start,charEnd:wordOffset};});
  let offset=0;
  return lyrics.map((text,index)=>{
    const start=offset;offset+=normalize(text).length;
    const group=spans.filter(w=>w.charEnd>start&&w.charStart<offset);
    if(!group.length||group[0].charStart!==start||group.at(-1).charEnd!==offset)throw new Error('Transcript word crosses a lyric line boundary');
    const issues=[];
    if(group.some(w=>w.confidence===0))issues.push('zero-confidence/padded');
    if(group.some(w=>!Number.isFinite(w.startTime)||!Number.isFinite(w.endTime)||w.startTime<0||w.endTime>duration||w.endTime<=w.startTime))issues.push('invalid-word-timing');
    if(group.some((w,i)=>i&&w.startTime<group[i-1].startTime))issues.push('nonmonotonic');
    return {index,text,start:group[0].startTime,end:group.at(-1).endTime,usable:issues.length===0,issues,wordCount:group.length};
  });
}
const stats=errors=>{
  const a=errors.filter(x=>x!==null).map(Math.abs).sort((a,b)=>a-b);
  return {meanAbs:a.length?a.reduce((a,b)=>a+b,0)/a.length:null,medianAbs:a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null,maxAbs:a.at(-1)??null,withinHalfSecond:a.filter(x=>x<=.5+1e-9).length,withinOneSecond:a.filter(x=>x<=1+1e-9).length};
};
export function scoreLines(lines,reference){
  if(lines.length!==reference.length||lines.some((l,i)=>normalize(l.text)!==normalize(reference[i].text)))throw new Error('Reference lyrics mismatch');
  const rows=lines.map((l,i)=>({...l,referenceStart:reference[i].start,referenceEnd:reference[i].end,startError:l.usable?l.start-reference[i].start:null,endError:l.usable?l.end-reference[i].end:null}));
  return {total:rows.length,usable:rows.filter(r=>r.usable).length,unusable:rows.filter(r=>!r.usable).length,bothWithinOneSecond:rows.filter(r=>r.usable&&Math.abs(r.startError)<=1+1e-9&&Math.abs(r.endError)<=1+1e-9).length,start:stats(rows.map(r=>r.startError)),end:stats(rows.map(r=>r.endError)),rows};
}
export function srt(lines){
  const time=s=>{let ms=Math.round(s*1000);const h=Math.floor(ms/3600000);ms%=3600000;const m=Math.floor(ms/60000);ms%=60000;const sec=Math.floor(ms/1000);return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
  return lines.filter(l=>l.usable).map((l,i)=>`${i+1}\n${time(l.start)} --> ${time(l.end)}\n${l.text}`).join('\n\n')+'\n';
}
