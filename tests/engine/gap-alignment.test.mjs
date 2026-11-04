import {test} from 'node:test';
import assert from 'node:assert/strict';
test('continuation evidence penalizes entry once, preserving long supported tokens',()=>{
 assert.deepEqual(gapAlignment([[2,2,2]],{openEnd:true,entryScores:[-3]}),[{start:0,end:3}]);
 assert.deepEqual(gapAlignment([[2,2,2]],{openEnd:true,entryScores:[-7]}),[]);
 assert.deepEqual(gapAlignment([[3,0,0],[0,2,0]],{openEnd:true,entryScores:[0,-4]}),[{start:0,end:1}]);
 assert.throws(()=>gapAlignment([[1]],{entryScores:[]}),/Invalid/);
});
import {gapAlignment,attentionGapBounds} from '../../src/engine/gap-alignment.mjs';
test('single remaining token retains positive acoustic evidence',()=>{
 const q={dimensions:[1,1,6],data:Float32Array.of(-4,-4,4,4,-4,-4)};
 assert.deepEqual(attentionGapBounds([q],6,1,{openEnd:true}),[{start:2,end:4}]);
 assert.deepEqual(attentionGapBounds([{...q,data:new Float32Array(6)}],6,1,{openEnd:true}),[]);
});
test('explicit blank states preserve intro, interior silence and outro',()=>{
 const scores=[Float32Array.from([-2,-2,3,3,-2,-2,-2,-2,-2,-2]),Float32Array.from([-2,-2,-2,-2,-2,-2,3,3,-2,-2])];
 assert.deepEqual(gapAlignment(scores),[{start:2,end:4},{start:6,end:8}]);
});
test('adjacent tokens need no intervening blank and none may collapse',()=>{
 assert.deepEqual(gapAlignment([Float32Array.of(2,-2),Float32Array.of(-2,2)]),[{start:0,end:1},{start:1,end:2}]);
 assert.equal(gapAlignment([Float32Array.of(2),Float32Array.of(2)]),undefined);
});
test('flat or malformed evidence does not fabricate boundaries',()=>{
 assert.equal(gapAlignment([new Float32Array(10)]),undefined);
 assert.equal(gapAlignment([Float32Array.of(NaN,2)]),undefined);
 assert.equal(gapAlignment([]),undefined);
});
test('open text endpoint defers unsupported future tokens',()=>{
 const scores=[Float32Array.of(-2,3,3,-2,-2,-2),Float32Array.of(-3,-3,-3,-3,-3,-3)];
 assert.deepEqual(gapAlignment(scores,{openEnd:true}),[{start:1,end:3}]);
 assert.equal(gapAlignment(scores).length,2);
});
test('open endpoint can consume no lyrics during an instrumental window',()=>{
 assert.deepEqual(gapAlignment([Float32Array.of(-2,-2,-2)],{openEnd:true}),[]);
 assert.deepEqual(gapAlignment([new Float32Array(4)],{openEnd:true}),[]);
});
test('open endpoint prefers trailing blank over unsupported token duration on ties',()=>{
 assert.deepEqual(gapAlignment([Float32Array.of(-2,3,3,0,0,0),new Float32Array(6)],{openEnd:true}),[{start:1,end:3}]);
});
