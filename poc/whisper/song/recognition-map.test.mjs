import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapRecognizedLyrics} from './recognition-map.mjs';
test('recover lyric line starts from acoustic transcript anchors without reference times',()=>{
  const words=[{text:'ab',startTime:2,endTime:3},{text:'def',startTime:5,endTime:7},{text:'abc',startTime:9,endTime:10}];
  const result=mapRecognizedLyrics('abc\ndef\nabc',words,12);
  assert.deepEqual(result.map(x=>x.startTime),[2,5,9]);
  assert.deepEqual(result.map(x=>x.text),['abc','def','abc']);
  assert.ok(result.every(x=>x.confidence>0));
});
test('no acoustic match is an invalid cue rather than fabricated success',()=>{
  assert.equal(mapRecognizedLyrics('abc',[],10)[0].confidence,0);
});
