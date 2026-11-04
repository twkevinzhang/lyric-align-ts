import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moraWeight,tokenMoraWeights} from '../../src/core/mora-weight.mjs';
test('kana count one mora and small kana merge into the previous kana',()=>{
 assert.equal(moraWeight('きょう'),2);
 assert.equal(moraWeight('ライト'),3);
 assert.equal(moraWeight('ー'),1);
});
test('kanji, Latin letters, digits and punctuation use fixed approximations',()=>{
 assert.equal(moraWeight('空'),2);
 assert.equal(moraWeight('girl'),1.6);
 assert.equal(moraWeight('7'),1);
 assert.equal(moraWeight('、 ？'),0);
});
test('undecodable byte tokens share the weight of their character',()=>{
 const decode=tokens=>tokens.length===1&&tokens[0]===1?'�':tokens.length===2?'空':'に';
 assert.deepEqual(tokenMoraWeights([1,2,3],decode),[1,1,1]);
 assert.deepEqual(tokenMoraWeights([1],()=>'�'),[.25]);
});
