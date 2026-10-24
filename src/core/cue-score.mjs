import {normalize} from './score.mjs';
const hasMissingText=w=>w.confidence===0||(w.timeline??[]).some(hasMissingText);
// Monotonic character alignment handles omitted text without shifting every later cue.
// Reference timestamps never participate in matching.
export function scoreCues(run,reference){
 const expected=Array.from(reference.map(x=>normalize(x.text)).join(''));
 const actual=[],owners=[];
 run.timeline.forEach((w,index)=>{for(const c of normalize(w.text)){actual.push(c);owners.push(index);}});
 const n=expected.length,m=actual.length,width=m+1;
 const dp=new Uint32Array((n+1)*width);
 for(let i=0;i<=n;i++)dp[i*width]=i;for(let j=0;j<=m;j++)dp[j]=j;
 for(let i=1;i<=n;i++)for(let j=1;j<=m;j++)dp[i*width+j]=Math.min(dp[(i-1)*width+j]+1,dp[i*width+j-1]+1,dp[(i-1)*width+j-1]+(expected[i-1]===actual[j-1]?0:1));
 const mapping=new Int32Array(n).fill(-1);let i=n,j=m;
 while(i||j){const cost=dp[i*width+j];if(i&&j&&cost===dp[(i-1)*width+j-1]+(expected[i-1]===actual[j-1]?0:1)){if(expected[i-1]===actual[j-1])mapping[i-1]=j-1;i--;j--;}else if(i&&cost===dp[(i-1)*width+j]+1)i--;else j--;}
 let offset=0;
 const rows=reference.map((cue,index)=>{const a=offset;offset+=Array.from(normalize(cue.text)).length;const indices=Array.from(mapping.slice(a,offset));
 const complete=indices.length>0&&indices.every((v,k)=>v>=0&&(!k||v===indices[k-1]+1));
 const wordIds=[...new Set(indices.filter(x=>x>=0).map(x=>owners[x]))];const group=wordIds.map(x=>run.timeline[x]);
 const valid=complete&&group.every(w=>!hasMissingText(w)&&Number.isFinite(w.startTime)&&w.startTime>=0&&w.startTime<=run.audioSeconds)&&group.every((w,k)=>!k||w.startTime>=group[k-1].startTime);
 return {line:index+1,text:cue.text,referenceStart:cue.start,start:group[0]?.startTime??null,end:group.at(-1)?.endTime??null,usable:valid,textComplete:complete,error:valid?group[0].startTime-cue.start:null};});
 const errors=rows.filter(r=>r.usable).map(r=>Math.abs(r.error));
 return {total:rows.length,matched:errors.length,withinOne:errors.filter(e=>e<=1+1e-9).length,max:errors.length?Math.max(...errors):null,mean:errors.length?errors.reduce((a,b)=>a+b)/errors.length:null,characterEditDistance:dp[n*width+m],rows};
}
