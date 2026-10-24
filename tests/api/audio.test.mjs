import{test}from'node:test';import assert from'node:assert/strict';
import{prepareAudio}from'../../src/audio.ts';
test('PCM is validated and copied; stereo AudioBuffer is averaged at 16 kHz',async()=>{
 const original=new Float32Array([.5,-.5]);const pcm=await prepareAudio({samples:original,sampleRate:16000});assert.deepEqual(pcm,original);assert.notEqual(pcm,original);
 const mono=await prepareAudio({numberOfChannels:2,length:2,sampleRate:16000,getChannelData:i=>new Float32Array(i?[0,1]:[1,0])});assert.deepEqual(mono,new Float32Array([.5,.5]));
});
test('bad PCM, empty audio and nonfinite samples reject before Worker transfer',async()=>{
 for(const audio of [{samples:new Float32Array(0),sampleRate:16000},{samples:new Float32Array([NaN]),sampleRate:16000},{samples:new Float32Array([0]),sampleRate:44100}])await assert.rejects(prepareAudio(audio));
});
