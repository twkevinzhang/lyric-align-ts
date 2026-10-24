import {readFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyDistribution} from './build-proof.mjs';
import {sourceFingerprint} from './native/build-proof.mjs';
const root=resolve(import.meta.dirname,'..');
await verifyDistribution(root);
for(const file of ['dist/index.js','dist/index.d.ts','dist/binding.js','dist/binding.d.ts','dist/contract.d.ts','dist/types.d.ts','dist/cues.d.ts','dist/worker.js','LICENSE','THIRD_PARTY_NOTICES.md'])await access(resolve(root,file));
const manifest=JSON.parse(await readFile(resolve(root,'dist/assets/manifest.json')));
if(manifest.nativeSource!==await sourceFingerprint(root))throw Error('Distribution native source does not match this commit; run build:native and build');
for(const[file,sha]of Object.entries(manifest.assets)){const bytes=await readFile(resolve(root,'dist/assets',file));if(createHash('sha256').update(bytes).digest('hex')!==sha)throw Error(`Asset hash changed: ${file}`);}
for(const file of ['dist/index.js','dist/binding.js','dist/worker.js']){const source=await readFile(resolve(root,file),'utf8');if(/(?:from\s*['"]node:|require\(['"](?:fs|path|child_process|worker_threads)|C:[/\\]Users[/\\]|127\.0\.0\.1:5174)/.test(source))throw Error(`Node/server dependency leaked into ${file}`);}
console.log('Distribution exports, asset hashes and browser-only bundle checks passed.');
