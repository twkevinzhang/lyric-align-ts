import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acceptance} from './acceptance.mjs';
test('start-only acceptance, outlier limit floors rather than rounds',()=>{
  const rows=Array.from({length:12},(_,i)=>({usable:true,startError:i?0.6:6.6,endError:100}));
  const r=acceptance(40,rows);
  assert.equal(r.pass,true);assert.equal(r.excluded.length,1);assert.equal(r.retainedCount,11);
  assert.equal(acceptance(40.01,rows).pass,false);
  assert.equal(acceptance(30,rows.slice(0,9)).excluded.length,0);
});
test('opposite errors cannot cancel; invalid lines cannot be discarded',()=>{
  assert.equal(acceptance(30,[{usable:true,startError:2},{usable:true,startError:-2}]).pass,false);
  assert.equal(acceptance(30,[{usable:false,startError:0}]).pass,false);
});
