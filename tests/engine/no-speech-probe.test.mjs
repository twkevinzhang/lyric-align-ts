import {test} from 'node:test';
import assert from 'node:assert/strict';
import {noSpeechProbability} from '../../src/engine/no-speech-probe.mjs';
test('no-speech uses full softmax and restores mode after success or failure',async()=>{
 const calls=[],module={_poc_set_alignment_only:n=>(calls.push(['mode',n]),0),_poc_set_vocab_subset:(p,n)=>(calls.push(['subset',p,n]),0)};
 const context={decodeTokens:async(t,p)=>calls.push(['decode',t,p]),getLogits:()=>Float32Array.of(1000,1000,-Infinity)};
 assert.equal(await noSpeechProbability(module,context,{startOfTextToken:7,nonSpeechToken:1},true),.5);
 assert.deepEqual(calls,[['mode',0],['subset',0,0],['decode',[7],0],['mode',1]]);
 context.decodeTokens=async()=>{throw Error('decode failed');};
 await assert.rejects(noSpeechProbability(module,context,{startOfTextToken:7,nonSpeechToken:1},true),/decode failed/);
 assert.deepEqual(calls.at(-1),['mode',1]);
});
test('invalid probability cannot silently become an instrumental gate',async()=>{
 const modes=[],module={_poc_set_alignment_only:n=>(modes.push(n),0),_poc_set_vocab_subset:()=>0};
 await assert.rejects(noSpeechProbability(module,{decodeTokens:async()=>{},getLogits:()=>Float32Array.of(-Infinity,-Infinity)},{startOfTextToken:7,nonSpeechToken:1},false),/Invalid no-speech logits/);
 assert.deepEqual(modes,[0,0]);
});
