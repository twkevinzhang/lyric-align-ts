import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vocabularySubset} from '../../src/core/vocab-subset.mjs';
test('keep all supplied text and every metadata/timestamp token exactly once',()=>{
  assert.deepEqual(Array.from(vocabularySubset([3,1,3],5,9)),[1,3,5,6,7,8]);
  assert.throws(()=>vocabularySubset([-1],5,9));
  assert.throws(()=>vocabularySubset([],9,9));
});
