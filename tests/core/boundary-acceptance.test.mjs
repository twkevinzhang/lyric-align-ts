import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundaryAcceptance,boundaryErrors} from '../../src/core/boundary-acceptance.mjs';

const rows=n=>Array.from({length:n},()=>({usable:true,startError:0.2,endError:-0.3}));
test('85 percent applies independently to both boundaries, without exclusions',()=>{
 const input=rows(20);
 for(let i=0;i<3;i++)input[i].startError=2;
 for(let i=17;i<20;i++)input[i].endError=-2;
 const result=boundaryAcceptance(3,input);
 assert.equal(result.pass,true);
 assert.equal(result.required,17);
 assert.equal(result.start.withinOne,17);
 assert.equal(result.end.withinOne,17);
 input[3].startError=2;
 assert.equal(boundaryAcceptance(3,input).pass,false);
});
test('strictly less than one second; round required count upward',()=>{
 const input=rows(12);input[0].startError=1;input[1].startError=-1;
 assert.equal(boundaryAcceptance(1,input).start.withinOne,10);
 assert.equal(boundaryAcceptance(1,input).required,11);
 assert.equal(boundaryAcceptance(1,input).pass,false);
 input[1].startError=-0.999999;
 assert.equal(boundaryAcceptance(1,input).pass,true);
 assert.equal(boundaryAcceptance(1,rows(125)).required,107);
 assert.equal(boundaryAcceptance(1,rows(56)).required,48);
});
test('missing and nonfinite boundaries remain in the denominator; MAE cannot hide them',()=>{
 const input=rows(20);input[0].usable=false;input[1].endError=null;input[2].startError=NaN;input[3].endError=Infinity;
 const result=boundaryAcceptance(1,input);
 assert.equal(result.total,20);
 assert.equal(result.start.withinOne,18);
 assert.equal(result.end.withinOne,17);
 assert.equal(result.start.meanAbs,null);
 assert.equal(result.end.meanAbs,null);
 assert.equal(result.start.invalid,2);
});
test('time and empty-input failures cannot pass on accuracy alone',()=>{
 for(const seconds of [3.000001,-1,NaN,Infinity,undefined])assert.equal(boundaryAcceptance(seconds,rows(20)).pass,false);
 assert.equal(boundaryAcceptance(3,rows(20)).pass,true);
 assert.equal(boundaryAcceptance(1,[]).pass,false);
});
test('mean error uses absolute errors from every row',()=>{
 const result=boundaryAcceptance(1,[{usable:true,startError:-2,endError:3},{usable:true,startError:2,endError:-1}]);
 assert.equal(result.start.meanAbs,2);
 assert.equal(result.end.meanAbs,2);
});
test('inverted, out-of-audio, missing and nonfinite ends are invalid even near the reference',()=>{
 const reference=[{start:1,end:1.1}];
 for(const end of [0.9,1.21,null,NaN,Infinity]){
  const errors=boundaryErrors([{line:1,usable:true,start:1,end,error:0}],reference,1.2);
  const result=boundaryAcceptance(1,errors);
  assert.equal(result.start.withinOne,1);
  assert.equal(result.end.invalid,1);
  assert.equal(result.end.meanAbs,null);
  assert.equal(result.pass,false);
 }
 const errors=boundaryErrors([{line:1,usable:true,start:1,end:1.2,error:0}],reference,1.2);
 assert.equal(boundaryAcceptance(1,errors).pass,true);
});
