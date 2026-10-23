import {test} from 'node:test';import assert from 'node:assert/strict';import {scoreCues} from './cue-score.mjs';
test('a synthesized suffix nested inside a real word consumes the invalid quota',()=>{
 const run={audioSeconds:10,timeline:[{text:'amazing',confidence:0.9,startTime:2,endTime:3,timeline:[{text:'amaz',confidence:0.9},{text:'ing',confidence:0}]}]};
 assert.equal(scoreCues(run,[{text:'amazing',start:2}]).rows[0].usable,false);
});
test('missing character fails only its cue, repeated later text stays ordered',()=>{
 const refs=[{text:'abc',start:1},{text:'xyz',start:4},{text:'abc',start:7}];
 const run={audioSeconds:10,timeline:[{text:'ac',startTime:1,endTime:2},{text:'xyz',startTime:4,endTime:5},{text:'abc',startTime:8,endTime:9}]};
 const r=scoreCues(run,refs);assert.equal(r.matched,2);assert.equal(r.withinOne,2);assert.equal(r.max,1);assert.equal(r.rows[0].usable,false);
});
test('padding is unmatched; end time does not affect start-only scoring',()=>{
 const r=scoreCues({audioSeconds:10,timeline:[{text:'a',startTime:2,endTime:99},{text:'b',startTime:3,endTime:3,confidence:0}]},[{text:'a',start:1},{text:'b',start:3}]);assert.equal(r.matched,1);assert.equal(r.withinOne,1);
});
test('reference timestamps do not influence text pairing',()=>{
 const run={audioSeconds:10,timeline:[{text:'aa',startTime:1,endTime:2},{text:'cc',startTime:6,endTime:7}]};
 const a=scoreCues(run,[{text:'aa',start:1},{text:'bb',start:4},{text:'cc',start:6}]);
 const b=scoreCues(run,[{text:'aa',start:8},{text:'bb',start:2},{text:'cc',start:0}]);
 assert.deepEqual(a.rows.map(r=>[r.start,r.usable]),b.rows.map(r=>[r.start,r.usable]));
});
