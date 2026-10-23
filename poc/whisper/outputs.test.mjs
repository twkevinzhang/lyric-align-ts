import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Integration guard: run after native.mjs; catches the wrong row of prefill logits.
test('every native decode snapshot contains real, finite, nonconstant logits and QK', async () => {
  const local = resolve(import.meta.dirname, '../../.local/whisper-poc');
  const id = (await readFile(resolve(local, 'latest-native.txt'), 'utf8')).trim();
  const dir = resolve(local, 'native', id);
  const records = JSON.parse(await readFile(resolve(dir, 'tensors.json')));
  for (const record of records) for (const kind of ['logits', 'qk']) {
    const bytes = await readFile(resolve(dir, `${record.name}.${kind}.f32`));
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < bytes.length; i += 4) {
      const x = bytes.readFloatLE(i);
      assert.ok(Number.isFinite(x));
      min = Math.min(min, x); max = Math.max(max, x);
    }
    assert.ok(max - min > 0.001, `${record.name}.${kind} is empty/constant (wrong logits row?)`);
  }
});
