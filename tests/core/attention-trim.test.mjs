import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trimAttentionPrefix,lookaheadBudget} from '../../src/core/attention-trim.mjs';
test('sentence commit revisits an unfinished line without losing text or stalling',()=>{
 const decoded={decodedTokens:[100,1,2,3,4,5],decodedTokensConfidence:Array(6).fill(1)};
 const path=[1,3,7,9,15].map((dest,source)=>({source,dest}));
 const full=trimAttentionPrefix(decoded,path,1,12,500,99,undefined,[false,true,false,false,true]);
 assert.deepEqual(full.decodedTokens,[100,1,2,507]);
 assert.equal(full.deferredTextCount,3);
 assert.equal(full.alignmentFrames,7);
 const long=trimAttentionPrefix(decoded,path,1,12,500,99,undefined,[false,false,false,false,true]);
 assert.deepEqual(long.decodedTokens,[100,1,2,3,4,512]);
});
test('end-only refinement does not change acoustic prefix allocation',()=>{
 const decoded={decodedTokens:[100,1,2],decodedTokensConfidence:[1,1,1]};
 const path=[{source:0,dest:1},{source:1,dest:24}];
 const base=trimAttentionPrefix(decoded,path,1,20,500,99,[{start:1,end:18},{start:24,end:28}]);
 const refined=trimAttentionPrefix(decoded,path,1,20,500,99,[{start:1,end:23,allocationEnd:18},{start:24,end:28,allocationEnd:28}]);
 assert.deepEqual(refined,base);
});
test('crossing acoustic token is revisited with its tail in the next window',()=>{
 const decoded={decodedTokens:[100,1,2],decodedTokensConfidence:[1,1,1]};
 const result=trimAttentionPrefix(decoded,[{source:0,dest:18},{source:1,dest:27}],1,20,500,99,[{start:18,end:25},{start:27,end:30}]);
 assert.deepEqual(result.decodedTokens,[100,518]);
 assert.equal(result.alignmentFrames,18);
 assert.equal(result.deferredTextCount,2);
 const startsAtZero=trimAttentionPrefix(decoded,[{source:0,dest:0},{source:1,dest:27}],1,20,500,99,[{start:0,end:25},{start:27,end:30}]);
 assert.deepEqual(startsAtZero.decodedTokens,[100,1,525]);
});
test('defer collapsed tail text and advance using an acoustic boundary',()=>{
  const decoded={decodedTokens:[11,12,13,1,2,3,4,10],decodedTokensConfidence:Array(8).fill(1)};
  const path=[{source:0,dest:0},{source:0,dest:2},{source:1,dest:3},{source:2,dest:9},{source:3,dest:9},{source:4,dest:9}];
  const r=trimAttentionPrefix(decoded,path,3,8,15,10);
  assert.deepEqual(r.decodedTokens,[11,12,13,1,2,23]);
  assert.equal(r.deferredTextCount,2);
  assert.deepEqual(r.alignmentPath.at(-1),{source:2,dest:7});
  assert.ok(r.alignmentPath.every(p=>p.dest<8));
});
test('lookahead budget depends on supplied lyric/audio lengths, with final remaining text preserved',()=>{
  assert.equal(lookaheadBudget(400,16000*150,30,400,false,440),136);
  assert.equal(lookaheadBudget(400,16000*150,10,60,true,440),61);
  assert.equal(lookaheadBudget(2000,16000*150,30,800,false,440),440);
  assert.equal(lookaheadBudget(400,16000*150,30,400,false,440,1.2),112);
  assert.throws(()=>lookaheadBudget(400,16000*150,30,400,false,440,0.5));
});
test('empty acoustic prefix advances the audio without consuming any lyrics',()=>{
 const decoded={decodedTokens:[100,1,2,3],decodedTokensConfidence:[1,1,1,1]};
 const result=trimAttentionPrefix(decoded,[],1,20,500,99);
 assert.deepEqual(result.decodedTokens,[100,520]);
 assert.deepEqual(result.alignmentPath,[{source:0,dest:19}]);
 assert.equal(result.deferredTextCount,3);
});
