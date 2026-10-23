import './prepare.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const local = resolve(root, '.local/whisper-poc');
const lock = JSON.parse(await readFile(resolve(import.meta.dirname, 'lock.json')));
const inputs = JSON.parse(await readFile(resolve(local, 'inputs.json')));
const runId = randomUUID();
const portable = process.argv.includes('--portable');
const trace = process.argv.includes('--trace');
if (portable && trace) throw new Error('Trace profile is the fixed AVX2 baseline; do not combine with portable');
const profile = trace ? 'avx2-trace' : portable ? 'portable' : 'avx2';
const buildDirectory = trace ? 'build-native-trace' : portable ? 'build-native-portable' : 'build-native';
const instrumentation = trace ? JSON.parse(await readFile(resolve(local, 'instrumentation.json'))) : undefined;
const output = resolve(local, 'native', runId);
await mkdir(output, { recursive: true });
const docker = process.env.DOCKER || (process.platform === 'win32' ? 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' : 'docker');
console.log(`Native CPU started: ${runId}`);
const start = performance.now();
const result = spawnSync(docker, ['run', '--rm', '--name', `whisper-poc-native-${runId}`, '-v', `${root}:/work`, '-w', '/work', lock.buildImage,
  `/work/.local/whisper-poc/${buildDirectory}/parity`, `/work/.local/whisper-poc/${lock.model.file}`,
  '/work/.local/whisper-poc/mel.f32', '/work/.local/whisper-poc/steps.txt', `/work/.local/whisper-poc/native/${runId}`],
{ encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
await writeFile(resolve(output, 'native.log'), `${result.stdout || ''}\n${result.stderr || ''}`);
if (result.error || result.status !== 0) throw result.error || new Error(`Native exited ${result.status}: ${result.stderr}`);
const run = { ...inputs, runId, runtime: 'linux-x64-native-docker', buildImage: lock.buildImage,
  profile, instrumentation,
  elapsedMs: performance.now() - start, toolchain: await readFile(resolve(local, 'toolchain.txt'), 'utf8') };
await writeFile(resolve(output, 'run.json'), JSON.stringify(run, null, 2));
await writeFile(resolve(local, trace ? 'latest-native-trace.txt' : portable ? 'latest-native-portable.txt' : 'latest-native.txt'), runId);
console.log(`Native complete: ${output}; ${run.elapsedMs.toFixed(0)} ms`);
