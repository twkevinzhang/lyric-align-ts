import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trimAttentionPrefix,lookaheadBudget} from '../../src/core/attention-trim.mjs';
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
