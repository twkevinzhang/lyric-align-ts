import test from 'node:test';
import assert from 'node:assert/strict';
import {prefixEvidence} from '../../src/engine/prefix-evidence.mjs';
test('normalized prefix evidence agrees with exhaustive legal path enumeration',()=>{
 const scores=[[.3,1,-.7,0],[-.2,-1,.8,1.1]];
 for(const blankAfter of [undefined,[false,true]]){
  const values=[[],[],[]],entryScores=[-.4,-.8];
  function walk(t,state,score){
   if(t===4){values[Math.ceil(state/2)].push(Math.exp(score));return;}
   for(const s of [state,state+1,...(state%2?[state+2]:[])]){
    if(s>4||(s>0&&s%2===0&&blankAfter?.[s/2-1]===false))continue;
    walk(t+1,s,score+(s%2?scores[(s-1)/2][t]:0)+(s!==state&&s%2?entryScores[(s-1)/2]:0));
   }
  }
  walk(0,0,0);
  const actual=prefixEvidence(scores,{blankAfter,entryScores});
  values.forEach((v,i)=>assert.ok(Math.abs(actual[i]-Math.log(v.reduce((a,b)=>a+b,0)/v.length))<1e-12));
 }
});
test('neutral emissions do not favor prefixes with more possible alignments',()=>{
 assert.deepEqual(prefixEvidence([Array(20).fill(0),Array(20).fill(0)]),[0,0,0]);
 assert.deepEqual(prefixEvidence([[0],[0]]),[0,0,-Infinity]);
});
