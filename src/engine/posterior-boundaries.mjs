const add=(a,b)=>a===-Infinity?b:b===-Infinity?a:Math.max(a,b)+Math.log1p(Math.exp(-Math.abs(a-b)));
// Sum over monotonic token/blank paths with the consumed text prefix fixed.
// Expected entry/exit transitions estimate boundaries, not occupancy peaks.
export function posteriorBoundaries(scores,{blankAfter}={}){
 const n=scores.length,T=scores[0]?.length??0,S=2*n+1;
 if(!n||T<n||scores.some(r=>r.length!==T||r.some(x=>!Number.isFinite(x))))return;
 const emission=(s,t)=>s%2?scores[(s-1)/2][t]:s>0&&blankAfter?.[s/2-1]===false?-Infinity:0;
 const forward=new Float64Array((T+1)*S).fill(-Infinity),backward=new Float64Array((T+1)*S).fill(-Infinity);
 forward[0]=0;
 // A frame can enter at most one new token. States outside this band
 // cannot belong to any complete path; leave them at negative infinity.
 for(let t=0;t<T;t++)for(let s=Math.max(0,S-2-2*(T-t-1));s<=Math.min(S-1,2*t+1);s++){
  let v=forward[t*S+s];
  if(s>0)v=add(v,forward[t*S+s-1]);
  if(s>1&&s%2)v=add(v,forward[t*S+s-2]);
  forward[(t+1)*S+s]=v+emission(s,t);
 }
 backward[T*S+S-1]=backward[T*S+S-2]=0;
 for(let t=T-1;t>=0;t--)for(let s=Math.max(0,S-2-2*(T-t));s<=Math.min(S-1,Math.max(0,2*t-1));s++){
  let v=emission(s,t)+backward[(t+1)*S+s];
  if(s+1<S)v=add(v,emission(s+1,t)+backward[(t+1)*S+s+1]);
  if(s+2<S&&s%2)v=add(v,emission(s+2,t)+backward[(t+1)*S+s+2]);
  backward[t*S+s]=v;
 }
 const z=add(forward[T*S+S-1],forward[T*S+S-2]);
 if(!Number.isFinite(z))return;
 return scores.map((_,i)=>{
  const s=2*i+1;let start=0,end=0;
  for(let t=0;t<T;t++){
   let incoming=forward[t*S+s-1];if(s>1)incoming=add(incoming,forward[t*S+s-2]);
   start+=t*Math.exp(incoming+emission(s,t)+backward[(t+1)*S+s]-z);
   let outgoing=emission(s+1,t)+backward[(t+1)*S+s+1];
   if(s+2<S)outgoing=add(outgoing,emission(s+2,t)+backward[(t+1)*S+s+2]);
   end+=t*Math.exp(forward[t*S+s]+outgoing-z);
  }
  if(i===n-1)end+=T*Math.exp(forward[T*S+s]-z);
  return {start,end};
 });
}
