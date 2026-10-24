import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {recordDistribution,verifyDistribution} from '../../scripts/build-proof.mjs';
test('packing refuses distribution from a different source commit or mixed output',async()=>{
 const root=await mkdtemp(join(tmpdir(),'lyric-dist-proof-'));
 try{
  for(const dir of ['src','vendor','scripts','dist'])await mkdir(join(root,dir),{recursive:true});
  for(const file of ['package.json','scripts/build.mjs','scripts/assets.mjs','scripts/build-proof.mjs','src/index.ts','dist/index.js'])await writeFile(join(root,file),'A');
  await recordDistribution(root);await verifyDistribution(root);
  await writeFile(join(root,'src/index.ts'),'B');await assert.rejects(verifyDistribution(root),/source|來源/);
  await writeFile(join(root,'src/index.ts'),'A');await writeFile(join(root,'dist/index.js'),'B');await assert.rejects(verifyDistribution(root),/index.js/);
 }finally{await rm(root,{recursive:true,force:true});}
});
