import test from 'node:test';
import assert from 'node:assert/strict';
import {linesFromWords,scoreLines} from './score.mjs';
test('maps repeated words in order and preserves early or late boundaries',()=>{
  const lines=linesFromWords(['Grace grace','We\'ve begun'],[{text:'Grace',startTime:0,endTime:1},{text:'grace',startTime:1,endTime:2},{text:"We've",startTime:3,endTime:4},{text:'begun',startTime:4,endTime:5}],10);
  const score=scoreLines(lines,[{text:'Grace grace',start:0.5,end:2},{text:"We've begun",start:2,end:6}]);
  assert.deepEqual(score.rows.map(x=>x.startError),[-0.5,1]);
  assert.equal(score.start.meanAbs,0.75);assert.equal(score.end.meanAbs,0.5);
});
test('cannot silently align a different or missing transcript by array index',()=>{
  assert.throws(()=>linesFromWords(['a missing line'],[{text:'a',startTime:0,endTime:1}],5),/transcript/i);
});
test('zero confidence padding and out of bounds are failures, not good matches',()=>{
  const lines=linesFromWords(['a','b'],[{text:'a',startTime:1,endTime:1,confidence:0},{text:'b',startTime:2,endTime:20}],10);
  const result=scoreLines(lines,[{text:'a',start:1,end:2},{text:'b',start:2,end:3}]);
  assert.equal(result.usable,0);assert.equal(result.start.meanAbs,null);assert.equal(result.start.withinOneSecond,0);
});
