import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const dir = resolve(root, '.local/whisper-poc');
const lockBytes = await readFile(resolve(import.meta.dirname, 'lock.json'));
const lock = JSON.parse(lockBytes);
const sha = data => createHash('sha256').update(data).digest('hex');
const commit = execFileSync('git', ['-C', resolve(dir, 'source'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (commit !== lock.commit) throw new Error('Fork commit mismatch');
if (execFileSync('git', ['-C', resolve(dir, 'source'), 'status', '--porcelain'], { encoding: 'utf8' }).trim()) throw new Error('Fork has local modifications');
const modelSha256 = sha(await readFile(resolve(dir, lock.model.file)));
if (modelSha256 !== lock.model.sha256) throw new Error('Model SHA-256 mismatch');
const mel = Buffer.alloc(lock.parameters.melBins * lock.parameters.melFrames * 4);
let state = lock.fixture.seed;
for (let i = 0; i < mel.length / 4; i++) {
  state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
  // Exactly representable multiples of 1/1024 in [-1, 1), no platform trig functions.
  mel.writeFloatLE(((state >>> 0) % 2048 - 1024) / 1024, i * 4);
}
const steps = lock.steps.map(s => `${s.name} ${s.nPast} ${s.tokens.length} ${s.tokens.join(' ')}`).join('\n') + '\n';
const provenance = {
  schema: 1, lockSha256: sha(lockBytes), commit, modelSha256,
  melSha256: sha(mel), stepsSha256: sha(steps), parameters: lock.parameters,
};
await mkdir(resolve(dir, 'native'), { recursive: true });
await writeFile(resolve(dir, 'mel.f32'), mel);
await writeFile(resolve(dir, 'steps.txt'), steps);
await writeFile(resolve(dir, 'inputs.json'), JSON.stringify(provenance, null, 2) + '\n');
console.log(JSON.stringify(provenance, null, 2));
