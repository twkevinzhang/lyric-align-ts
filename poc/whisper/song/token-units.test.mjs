import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tokenTextUnits} from './token-units.mjs';
test('separate text timings and combine incomplete UTF-8 token fragments',()=>{
  const words=[{timeline:[1,2,3,4].map((id,i)=>({id,startTime:i,endTime:i+1,confidence:1}))}];
  const decode=ids=>ids.join(',')==='2,3'?'橋':({1:'高架',2:'\uFFFD',3:'\uFFFD',4:'を'})[ids[0]];
  const out=tokenTextUnits(words,decode,()=>true);
  assert.deepEqual(out.map(w=>[w.text,w.startTime,w.endTime]),[['高架',0,1],['橋',1,3],['を',3,4]]);
});
