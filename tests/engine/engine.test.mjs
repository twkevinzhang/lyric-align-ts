import test from 'node:test';
import assert from 'node:assert/strict';
import { Whisper } from '../../vendor/echogarden/Whisper.mjs';
import { BrowserEngine, validatePcm } from '../../src/engine/engine.mjs';

test('intermediate acoustic windows accept explicit validated sizes',()=>{
 for(const audioContext of [32,1040,1136,1250,1500])assert.doesNotThrow(()=>new BrowserEngine({audioContext}));
 for(const audioContext of [0,31,1001.5,1501,NaN])assert.throws(()=>new BrowserEngine({audioContext}),/configuration/);
});
test('browser upstream exposes alignment and deterministic decode',()=>{ const w=new Whisper(); assert.equal(typeof w.align,'function'); assert.equal(typeof w.decodeTokens,'function'); assert.equal(w.specialTokens.endOfTextToken,50257); });
test('PCM validation rejects invalid input before native allocation',()=>{ assert.throws(()=>validatePcm(new Float32Array([NaN])),/finite/); assert.throws(()=>validatePcm(new Float32Array()),/empty/); assert.doesNotThrow(()=>validatePcm(new Float32Array([0,1]))); });
