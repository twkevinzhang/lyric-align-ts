import {test} from 'node:test';import assert from 'node:assert/strict';
import {timelineToCues,toSrt} from '../../src/cues.ts';
test('match lyrics across word boundaries and report missing text',()=>{
 const cues=timelineToCues(['abc','def','missing'],[{text:'abcdef',startTime:1,endTime:2,confidence:1}],5);
 assert.equal(cues[0].matched,true);assert.equal(cues[1].matched,true);assert.equal(cues[2].matched,false);
});
test('zero duration is retained diagnostically but never emitted as an invalid SRT cue',()=>{
 const cues=timelineToCues(['a','b'],[{text:'a',startTime:1,endTime:1,confidence:1},{text:'b',startTime:2,endTime:3,confidence:1}],5);
 assert.ok(cues[0].issues.includes('zero-duration'));const text=toSrt(cues);assert.ok(!text.includes('00:00:01,000 --> 00:00:01,000'));assert.ok(text.includes('\nb\n'));
});
test('nested synthesized padding invalidates a cue',()=>{
 const cues=timelineToCues(['test'],[{text:'test',startTime:1,endTime:2,confidence:1,timeline:[{text:'st',confidence:0,startTime:1,endTime:2}]}],5);
 assert.equal(cues[0].matched,false);assert.equal(toSrt(cues),'');
});
