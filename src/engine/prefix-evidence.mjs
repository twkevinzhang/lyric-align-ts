const add=(a,b)=>a===-Infinity?b:b===-Infinity?a:Math.max(a,b)+Math.log1p(Math.exp(-Math.abs(a-b)));
// Mean likelihood over every legal alignment for each consumed prefix. The
// parallel zero-emission recurrence counts paths, removing combinatorial bias.
export function prefixEvidence(scores,{blankAfter,entryScores}={}){
 const n=scores.length,T=scores[0]?.length??0,S=2*n+1;
 if(!n||!T||scores.some(r=>r.length!==T||r.some(x=>!Number.isFinite(x))))throw Error('Invalid prefix evidence');
 let mass=new Float64Array(S).fill(-Infinity),count=new Float64Array(S).fill(-Infinity);
 mass[0]=count[0]=0;
 for(let t=0;t<T;t++){
  const next=new Float64Array(S).fill(-Infinity),ways=new Float64Array(S).fill(-Infinity);
  for(let s=0;s<S;s++){
   if(s>0&&s%2===0&&blankAfter?.[s/2-1]===false)continue;
   const entry=s%2?(entryScores?.[(s-1)/2]??0):0;
   let m=mass[s],c=count[s];
   if(s>0){m=add(m,mass[s-1]+entry);c=add(c,count[s-1]);}
   if(s>1&&s%2){m=add(m,mass[s-2]+entry);c=add(c,count[s-2]);}
   next[s]=m+(s%2?scores[(s-1)/2][t]:0);ways[s]=c;
  }
  mass=next;count=ways;
 }
 return Array.from({length:n+1},(_,i)=>{
  const m=i?add(mass[2*i-1],mass[2*i]):mass[0],c=i?add(count[2*i-1],count[2*i]):count[0];
  return c===-Infinity?-Infinity:m-c;
 });
}
