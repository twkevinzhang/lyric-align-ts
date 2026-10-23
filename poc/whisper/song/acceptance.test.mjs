import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acceptance} from './acceptance.mjs';
test('start-only acceptance, outlier limit floors rather than rounds',()=>{
  const rows=Array.from({length:12},(_,i)=>({usable:true,startError:i?0.6:6.6,endError:100}));
  const r=acceptance(10,rows);
  assert.equal(r.pass,true);assert.equal(r.excluded.length,1);assert.equal(r.retainedCount,11);
  assert.equal(acceptance(10.01,rows).pass,false);
  assert.equal(acceptance(10,rows.slice(0,9)).excluded.length,0);
});
test('opposite errors cannot cancel; invalid lines use the same exclusion quota',()=>{
  assert.equal(acceptance(10,[{usable:true,startError:2},{usable:true,startError:-2}]).pass,false);
  assert.equal(acceptance(10,[{usable:false,startError:0}]).pass,false);
  const rows=Array.from({length:10},(_,i)=>({line:100+i,usable:i!==0,startError:i===0?null:0.5}));
  const result=acceptance(10,rows);
  assert.equal(result.pass,true);
  assert.equal(result.excluded[0].line,100);
  assert.equal(result.excluded[0].reason,'invalid');
  assert.equal(result.meanAbs,0.5);
  rows[1].usable=false;
  assert.equal(acceptance(10,rows).qualityPass,false);
});
test('reject malformed duration and empty input, exclude nonfinite errors as invalid',()=>{
  for(const seconds of [-1,NaN,Infinity,undefined]) assert.equal(acceptance(seconds,[{usable:true,startError:0}]).pass,false);
  assert.equal(acceptance(1,[]).pass,false);
  const rows=Array.from({length:10},()=>({usable:true,startError:1}));
  rows[0].startError=NaN;
  assert.equal(acceptance(10,rows).pass,true);
  rows[1].startError=Infinity;
  assert.equal(acceptance(10,rows).pass,false);
});
