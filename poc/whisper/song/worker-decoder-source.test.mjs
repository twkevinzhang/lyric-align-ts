import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {workerDecoderSource} from './worker-decoder-source.mjs';
const echo=process.env.ECHOGARDEN_DIR??'C:/Projects/lyric-align-ts/.local/echogarden-test/node_modules/echogarden';
const {Whisper}=await import(pathToFileURL(resolve(echo,'dist/recognition/WhisperSTT.js')));
const vectors=await import(pathToFileURL(resolve(echo,'dist/math/VectorMath.js')));
test('worker top-1 decisions match pinned upstream on timestamps, forced lyrics and EOS',async()=>{
  const specialTokens={endOfTextToken:10,timestampTokensStart:15};
  const initialTokens=[11,12,13],remainingTokens=[3,4];
  const options={topCandidateCount:1,temperature:0,suppressRepetition:false,decodeTimestampTokens:true,endTokenThreshold:0.9,maxTokensPerPart:20,includeEndTokenInCandidates:false,punctuationThreshold:Infinity};
  const makeContext=()=>{
    let call=-1;
    return {decodeTokens:async()=>{call++;},getCrossAttentionQKs:async()=>({dimensions:[1n,1n,2n],data:new Float32Array([0,1])}),getLogits:()=>{
      const logits=new Float32Array(20).fill(-10);logits[call===1?3:call===2?4:10]=10;return logits;
    }};
  };
  const decoder=new Whisper('tiny','unused','unused');
  Object.assign(decoder,{specialTokens,context:makeContext(),textToTokens:()=>[0],getSuppressedTextTokens:()=>[],getSuppressedMetadataTokens:()=>[],getAllowedPunctuationMarks:()=>[],tokensToText:()=>'',tokenToText:()=>''});
  const filter=(logits,tokens)=>logits.map((v,i)=>i===(remainingTokens[tokens.filter(t=>t<10).length]??10)?v:-Infinity);
  const expected=await decoder.decodeTokens(initialTokens,30,true,true,options,filter,{logLevel:'silent'});
  const scope={self:{},performance,Float32Array,Uint8Array};
  vm.runInNewContext(workerDecoderSource(Whisper,vectors),scope);
  const actual=await scope.self.runGuided({initialTokens,remainingTokens,specialTokens,suppressedMetadataTokens:[],spaceToken:0,audioDuration:30,isFirstPart:true,isFinalPart:true,options},makeContext());
  assert.deepEqual(Array.from(actual.decodedTokens),expected.decodedTokens);
  assert.deepEqual(Array.from(actual.decodedTokensConfidence),expected.decodedTokensConfidence);
  assert.deepEqual(expected.decodedTokens,[11,12,13,15,3,4,10]);
});
