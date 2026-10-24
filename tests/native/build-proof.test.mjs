import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sourceFingerprint,recordBuild,verifyBuild} from '../../scripts/native/build-proof.mjs';

test('commit switch refuses mismatched native source or modified binary',async()=>{
 const root=await mkdtemp(join(tmpdir(),'lyric-native-proof-'));
 try{
  for(const dir of ['native','scripts/native','output'])await mkdir(join(root,dir),{recursive:true});
  await writeFile(join(root,'native/bridge.cpp'),'version A\n');
  for(const name of ['parity.js','parity.wasm'])await writeFile(join(root,'output',name),'built A');
  await assert.rejects(verifyBuild(root,join(root,'output')),/build:native/);
  await recordBuild(root,join(root,'output'));await verifyBuild(root,join(root,'output'));
  const original=await sourceFingerprint(root);
  await writeFile(join(root,'native/bridge.cpp'),'version A\r\n');assert.equal(await sourceFingerprint(root),original);
  await writeFile(join(root,'native/bridge.cpp'),'version B\n');await assert.rejects(verifyBuild(root,join(root,'output')),/source|來源/);
  await writeFile(join(root,'native/bridge.cpp'),'version A\n');await writeFile(join(root,'output/parity.wasm'),'built B');
  await assert.rejects(verifyBuild(root,join(root,'output')),/parity.wasm/);
 }finally{await rm(root,{recursive:true,force:true});}
});
