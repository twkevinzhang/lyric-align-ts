import{test}from'node:test';import assert from'node:assert/strict';
import{prepareAudio}from'../../src/audio.ts';
function pcmWav(){
 const b=new ArrayBuffer(62),v=new DataView(b);const tag=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
 tag(0,'RIFF');v.setUint32(4,54,true);tag(8,'WAVE');tag(12,'JUNK');v.setUint32(16,1,true);tag(22,'fmt ');v.setUint32(26,16,true);v.setUint16(30,1,true);v.setUint16(32,1,true);v.setUint32(34,16000,true);v.setUint32(38,32000,true);v.setUint16(42,2,true);v.setUint16(44,16,true);tag(46,'data');v.setUint32(50,8,true);[-32768,-1,0,32767].forEach((x,i)=>v.setInt16(54+i*2,x,true));return b;
}
test('16 kHz mono PCM WAV decodes exact samples without Web Audio, including odd padded metadata',async()=>{
 const pcm=await prepareAudio(new Blob([pcmWav()]));assert.deepEqual(pcm,Float32Array.of(-1,-1/32768,0,1));
});
test('truncated or unsupported WAV does not take PCM shortcut',async()=>{
 const b=pcmWav();new DataView(b).setUint32(34,44100,true);
 for(const bytes of [b,pcmWav().slice(0,61)])await assert.rejects(prepareAudio(new Blob([bytes])),/Web Audio/);
});
test('PCM is validated and copied; stereo AudioBuffer is averaged at 16 kHz',async()=>{
 const original=new Float32Array([.5,-.5]);const pcm=await prepareAudio({samples:original,sampleRate:16000});assert.deepEqual(pcm,original);assert.notEqual(pcm,original);
 const mono=await prepareAudio({numberOfChannels:2,length:2,sampleRate:16000,getChannelData:i=>new Float32Array(i?[0,1]:[1,0])});assert.deepEqual(mono,new Float32Array([.5,.5]));
});
test('bad PCM, empty audio and nonfinite samples reject before Worker transfer',async()=>{
 for(const audio of [{samples:new Float32Array(0),sampleRate:16000},{samples:new Float32Array([NaN]),sampleRate:16000},{samples:new Float32Array([0]),sampleRate:44100}])await assert.rejects(prepareAudio(audio));
});
