import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lyricPauseMask} from '../../src/engine/lyric-pauses.mjs';
import {gapAlignment} from '../../src/engine/gap-alignment.mjs';
test('text-only pauses respect lines and fragmented UTF-8',()=>{
 const decode=ids=>ids.join(',')==='2,3'?'雪':({1:'春',2:'�',3:'�',4:' Next'})[ids[0]];
 assert.deepEqual(lyricPauseMask([1,2,3,4],decode,'春雪\nNext'),[false,false,true,true]);
 assert.equal(lyricPauseMask([1,4],decode,'春雨\nNext'),undefined);
});
test('line interior cannot insert an instrumental blank',()=>{
 const scores=[Float32Array.of(3,3,-2,-2,-2,-2),Float32Array.of(-2,-2,-2,-2,3,3)];
 const b=gapAlignment(scores,{blankAfter:[false,true]});
 assert.equal(b[0].end,b[1].start);
 assert.deepEqual(gapAlignment(scores),[{start:0,end:2},{start:4,end:6}]);
});
