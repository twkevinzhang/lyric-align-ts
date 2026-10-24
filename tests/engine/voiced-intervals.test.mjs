import test from 'node:test';
import assert from 'node:assert/strict';
import {voicedIntervals} from '../../src/engine/voiced-intervals.mjs';
test('linear interval optimizer equals exhaustive interval search',()=>{
 const p=[.1,.2,.8,.9,.7,.3,.2,.1],step=.5,a={start:1.1,end:2.7};
 let best=-Infinity,expected;
 for(let s=0;s<p.length;s++)for(let e=s+1;e<=p.length;e++){
  const score=p.slice(s,e).reduce((v,x)=>v+Math.log(x/(1-x))*step,0)-(s*step-a.start)**2/2-(e*step-a.end)**2/2;
  if(score>best){best=score;expected={start:s*step,end:e*step};}
 }
 assert.deepEqual(voicedIntervals([a],p,step,4),[expected]);
 assert.deepEqual(a,{start:1.1,end:2.7});
});
test('joint sentence allocation preserves order even when voice evidence joins sentences',()=>{
 const out=voicedIntervals([{start:.5,end:1},{start:2,end:3}],Array(40).fill(.99),.1,4);
 assert.ok(out[0].end<=out[1].start);
 assert.ok(out.every(a=>a.start<a.end));
 assert.throws(()=>voicedIntervals([{start:0,end:1}],[NaN],1,1),/Invalid/);
});
test('end-only mode preserves onset exactly and finds the best nonoverlapping endpoint',()=>{
 const p=[.1,.2,.8,.9,.7,.3,.2,.1],step=.5,a={start:1.1,end:2.7};
 let best=-Infinity,end;
 for(let e=4;e<=p.length;e++){
  const score=p.slice(3,e).reduce((v,x)=>v+Math.log(x/(1-x))*step,0)-(e*step-a.end)**2/2;
  if(score>best){best=score;end=e*step;}
 }
 assert.deepEqual(voicedIntervals([a],p,step,4,'ends'),[{start:1.1,end}]);
});
