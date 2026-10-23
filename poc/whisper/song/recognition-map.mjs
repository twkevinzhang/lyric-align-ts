import {normalize} from './score.mjs';
// This uses recognized audio timings only. No SRT/reference object is accepted.
export function mapRecognizedLyrics(lyrics,timeline,duration){
  const lines=lyrics.split(/\r?\n/).map(text=>({text,chars:Array.from(normalize(text))})).filter(l=>l.chars.length);
  const expected=lines.flatMap(l=>l.chars),actual=[],owners=[];
  timeline.forEach((w,i)=>{for(const c of normalize(w.text)){actual.push(c);owners.push(i);}});
  const n=expected.length,m=actual.length,width=m+1,dp=new Uint32Array((n+1)*width);
  for(let i=0;i<=n;i++)dp[i*width]=i;
  for(let j=0;j<=m;j++)dp[j]=j;
  for(let i=1;i<=n;i++)for(let j=1;j<=m;j++)dp[i*width+j]=Math.min(dp[(i-1)*width+j]+1,dp[i*width+j-1]+1,dp[(i-1)*width+j-1]+(expected[i-1]===actual[j-1]?0:1));
  const mapping=new Int32Array(n).fill(-1);let i=n,j=m;
  while(i||j){
    const cost=dp[i*width+j];
    if(i&&j&&cost===dp[(i-1)*width+j-1]+(expected[i-1]===actual[j-1]?0:1)){if(expected[i-1]===actual[j-1])mapping[i-1]=j-1;i--;j--;}
    else if(i&&cost===dp[(i-1)*width+j]+1)i--;else j--;
  }
  let offset=0;
  return lines.map(line=>{
    const matches=Array.from(mapping.subarray(offset,offset+line.chars.length)).filter(x=>x>=0);offset+=line.chars.length;
    const group=matches.map(x=>timeline[owners[x]]);
    const fraction=matches.length/line.chars.length;
    const valid=group.length>0&&fraction>=0.2&&group.every(w=>Number.isFinite(w.startTime)&&w.startTime>=0&&w.startTime<=duration);
    return {type:'word',text:line.text,startTime:group[0]?.startTime??0,endTime:group.at(-1)?.endTime??0,confidence:valid?fraction:0,acousticMatchFraction:fraction};
  });
}
