import {test} from 'node:test';
import assert from 'node:assert/strict';
import {posteriorBoundaries} from '../../src/engine/posterior-boundaries.mjs';
test('posterior entry/exit expectations match exhaustive legal paths',()=>{
 for(const n of [1,2,3])for(let T=n;T<=n+3;T++){
 const scores=Array.from({length:n},(_,i)=>Array.from({length:T},(_,t)=>Math.sin(i*7+t*3)*2)),S=2*n+1;
 for(const blankAfter of [undefined,Array.from({length:n},()=>false),Array.from({length:n},(_,i)=>i%2===0)]){
  const paths=[];
  function visit(states,previous,weight){
   if(states.length===T){if(previous>=S-2)paths.push({states,weight});return;}
   for(let s=previous;s<=Math.min(S-1,previous+2);s++){
    if(s===previous+2&&s%2===0)continue;
    if(s>0&&s%2===0&&blankAfter?.[s/2-1]===false)continue;
    visit([...states,s],s,weight*Math.exp(s%2?scores[(s-1)/2][states.length]:0));
   }
  }
  visit([],0,1);const sum=paths.reduce((v,p)=>v+p.weight,0);
  const actual=posteriorBoundaries(scores,{blankAfter});
  for(let i=0;i<n;i++){
   const start=paths.reduce((v,p)=>v+p.states.indexOf(2*i+1)*p.weight,0)/sum;
   const end=paths.reduce((v,p)=>v+(p.states.lastIndexOf(2*i+1)+1)*p.weight,0)/sum;
   assert.ok(Math.abs(actual[i].start-start)<1e-10);
   assert.ok(Math.abs(actual[i].end-end)<1e-10);
  }
 }
 }
});
test('posterior rejects impossible or malformed evidence',()=>{
 assert.equal(posteriorBoundaries([[1],[1]]),undefined);
 assert.equal(posteriorBoundaries([[NaN,1]]),undefined);
});
