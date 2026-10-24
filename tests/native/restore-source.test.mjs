import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {restoreSource} from '../../scripts/native/restore-source.mjs';
test('returning to an older generator removes newer tracked source patches',async()=>{
 const root=await mkdtemp(join(tmpdir(),'lyric-source-restore-'));
 const git=(...args)=>execFileSync('git',['-c','core.autocrlf=false','-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 try{
  git('init');await writeFile(join(root,'vec.h'),'original\n');await writeFile(join(root,'vec.cpp'),'original\n');git('add','.');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','fixture');const commit=git('rev-parse','HEAD');
  await writeFile(join(root,'vec.h'),'fast vector patch\n');await writeFile(join(root,'vec.cpp'),'fast activation patch\n');await writeFile(join(root,'untracked.txt'),'keep');
  assert.throws(()=>restoreSource(root,'0'.repeat(40)),/commit/);
  restoreSource(root,commit);
  assert.equal(await readFile(join(root,'vec.h'),'utf8'),'original\n');assert.equal(await readFile(join(root,'vec.cpp'),'utf8'),'original\n');assert.equal(await readFile(join(root,'untracked.txt'),'utf8'),'keep');
 }finally{await rm(root,{recursive:true,force:true});}
});
