import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {workerAlignmentSource} from './worker-alignment-source.mjs';
const root=process.env.ECHOGARDEN_DIR??'C:/Projects/lyric-align-ts/.local/echogarden-test/node_modules/echogarden';
const {Whisper}=await import(pathToFileURL(resolve(root,'dist/recognition/WhisperSTT.js')));
const vectors=await import(pathToFileURL(resolve(root,'dist/math/VectorMath.js')));
test('Worker DTW uses the same filtering and alignment path as pinned upstream',async()=>{
  const source=workerAlignmentSource(Whisper,vectors,await readFile(resolve(root,'dist/alignment/DTWSequenceAlignmentWindowed.js'),'utf8'),await readFile(resolve(root,'dist/math/MedianFilter.js'),'utf8'));
  const scope={self:{},Float32Array,Int32Array};vm.runInNewContext(source,scope);
  for(const frames of [4,19,30]){
    const tokens=[1,2,3,4];
    const qks=tokens.map((_,t)=>({dimensions:[2n,1n,30n],data:Float32Array.from({length:60},(_,i)=>Math.sin(i*.7+t)*3)}));
    const decoder=new Whisper('tiny','unused','unused');
    const expected=await decoder.findAlignmentPathFromCrossAttentionQKs(qks,tokens,0,frames);
    const actual=await scope.self.alignGuided(qks,tokens,0,frames);
    assert.equal(JSON.stringify(actual),JSON.stringify(expected));
  }
});
