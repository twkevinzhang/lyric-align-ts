import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {init,Tiktoken} from 'tiktoken/lite/init';
import {WHISPER_PATTERN,metadataTokens} from '../../src/engine/tokenizer.mjs';
import {Whisper} from '../../vendor/echogarden/Whisper.mjs';
// Captured independently from pinned Echogarden 3.4.0 initializeTokenizerIfNeeded/textToTokens.
const fixtures=[['Amazing grace how sweet the sound',[16833,2118,10042,577,3844,264,1626]],['君の声が聞こえる',[24168,2972,32045,5142,25468,3503,44547]],['Hello 世界！ 心の中で',[15947,220,24486,171,120,223,220,7945,2972,5975,2474]],['Don’t stop believing.',[7450,913,247,83,1590,16594,13]]];
const readFileSyncBytes=await readFile(new URL('../../node_modules/tiktoken/lite/tiktoken_bg.wasm',import.meta.url));
test('browser tokenizer agrees with pinned upstream English/Japanese/mixed fixtures',async()=>{const path=new URL('../../dist/assets/multilingual.tiktoken',import.meta.url);const data=await readFile(path,'utf8');await init(imports=>WebAssembly.instantiate(readFileSyncBytes,imports));const w=new Whisper();const t=new Tiktoken(data,metadataTokens(w.specialTokens),WHISPER_PATTERN);try{for(const [text,expected]of fixtures){assert.deepEqual(Array.from(t.encode(text,[],[])),expected);assert.equal(new TextDecoder().decode(t.decode(new Uint32Array(expected))),text);}}finally{t.free();}});

