import {test} from 'node:test';
import assert from 'node:assert/strict';
import {patchContextSource} from './context-source.mjs';
test('short context changes the audio chunk size and resolves original imports only',()=>{
  const source="import {x} from '../x.js';\nconst maxAudioSamplesPerPart = sampleRate * 30;\nconst tail=1;";
  assert.equal(patchContextSource(source,750,s=>'file:///resolved/'+s),"import {x} from \"file:///resolved/../x.js\";\nconst maxAudioSamplesPerPart = sampleRate * 15;\nconst tail=1;");
  assert.throws(()=>patchContextSource(source,749,x=>x));
  assert.throws(()=>patchContextSource('',750,x=>x));
  assert.ok(patchContextSource(source+"\nconst lazy=import('tiktoken');",750,s=>'file:///resolved/'+s).includes('import("file:///resolved/tiktoken")'));
});
