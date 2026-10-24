import {test} from 'node:test';
import assert from 'node:assert/strict';
import {alignSegments} from '../../src/engine/align-segments.ts';
const segment=(text,start,end)=>({text,start,end});
test('keeps exact lyric text, order and repeated chorus evidence in seconds',()=>{
 const result=alignSegments([segment('Hello world',1,2),segment('go away',3,4),segment('Hello world',5,6)],['  Hello, world!  ','go away','Hello world'],{});
 assert.deepEqual(result.map(r=>[r.line,r.start,r.end,r.matched]),[['  Hello, world!  ',1,2,true],['go away',3,4,true],['Hello world',5,6,true]]);
 assert.ok(result.every(r=>r.score===1));
});
test('missing middle line is unmatched without interpolation or stealing next line',()=>{
 const r=alignSegments([segment('hello world',1,2),segment('good night',8,9)],['hello world','xxxxxxxxxxxx','good night'],{});
 assert.deepEqual(r.map(r=>[r.start,r.end,r.matched]),[[1,2,true],[null,null,false],[8,9,true]]);
});
test('word evidence localizes individual lines inside a long ASR segment',()=>{
 const r=alignSegments([{text:'hello world goodbye moon',start:0,end:10,words:[{word:'hello',start:1,end:2},{word:'world',start:2,end:3},{word:'goodbye',start:7,end:8},{word:'moon',start:8,end:9}]}],['hello world','goodbye moon'],{});
 assert.deepEqual(r.map(r=>[r.start,r.end]),[[1,3],[7,9]]);
});
test('no evidence and nonspoken lines retain rows with null times',()=>{
 const lyrics=['hello','   ','♪','(Chorus)'];const r=alignSegments([],lyrics,{});
 assert.deepEqual(r.map(r=>r.line),lyrics);assert.ok(r.every(r=>!r.matched&&r.start===null&&r.end===null&&r.score===0));
});
test('threshold controls text similarity without rewriting lyrics',()=>{
 const s=[segment('hella',1,2)];
 const a=alignSegments(s,['hello'],{threshold:.7})[0],b=alignSegments(s,['hello'],{threshold:.9})[0];
 assert.equal(a.score,.8);assert.equal(a.matched,true);assert.equal(a.line,'hello');assert.equal(b.matched,false);assert.equal(b.start,null);
});
test('unrelated text and surplus chorus cannot manufacture matched timings',()=>{
 const r=alignSegments([segment('hello',2,3)],['hello','hello','zzzzzzzz'],{});
 assert.equal(r.filter(x=>x.matched).length,1);assert.ok(r.filter(x=>!x.matched).every(x=>x.start===null&&x.end===null));
});
test('validates segments, words, lyric shape and options before alignment',()=>{
 for(const s of [[segment('x',-1,2)],[segment('x',2,1)],[segment('x',0,Infinity)],[segment('x',2,3),segment('y',1,2)],[{text:'x',start:0,end:1,words:[{word:'x',start:0,end:2}]}]])assert.throws(()=>alignSegments(s,['x'],{}),{code:'INVALID_INPUT'});
 assert.throws(()=>alignSegments([],['x',7],{}),{code:'INVALID_INPUT'});
 assert.throws(()=>alignSegments([],['x'],{window:1}),{code:'UNSUPPORTED_OPTION'});
});
test('cannot split one coarse timing unit into independently matched lyric lines',()=>{
 for(const segments of [[segment('lalalala',1,2)],[{text:'lalalala',start:0,end:3,words:[{word:'lalalala',start:1,end:2}]}]]){
  const r=alignSegments(segments,['lala','lala'],{});
  assert.ok(r.every(line=>!line.matched&&line.start===null&&line.end===null));
 }
});
test('malformed words reject as invalid input instead of generic engine failure',()=>{
 for(const words of [[null],[1],[{}]])assert.throws(()=>alignSegments([{text:'x',start:0,end:1,words}],['x'],{}),{code:'INVALID_INPUT'});
});
