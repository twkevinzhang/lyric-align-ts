import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..');
const read=file=>readFile(resolve(root,file),'utf8');
test('native build pins compiler, source and separately acquired tiny model',async()=>{
 const lock=JSON.parse(await read('native/lock.json'));
 assert.equal(lock.commit,'ca0598eb272bf3ef16f8163ab0bd98503803dee8');
 assert.match(lock.buildImage,/@sha256:[a-f0-9]{64}$/);
 assert.equal(lock.model.sha256,'818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7');
 assert.match(await read('scripts/native/paths.mjs'),/clone','--no-hardlinks/);
 const build=await read('scripts/native/build.sh');
 assert.match(build,/-DPOC_PTHREAD_POOL_SIZE=12/);
 assert.match(build,/-ffp-contract=off/);
 for(const f of ['build.sh','packed-source.mjs','compact-source.mjs','timescale-source.mjs'])assert.doesNotMatch(await read(`scripts/native/${f}`),/poc\/whisper|[A-Z]:\/|cached-weights|source-experimental/);
});
test('source preparation reproduces the verified fast kernel and is idempotent',{skip:process.env.NATIVE_SOURCE_TEST!=='1'},async()=>{
 const prepare=()=>execFileSync(process.execPath,['scripts/native/prepare.mjs'],{cwd:root,stdio:'pipe'});
 const hash=s=>createHash('sha256').update(s).digest('hex');
 prepare();
 const expected={
  "src/whisper.cpp": "4555630b7aa1b160ac46ad1272a24b1805aa6f0dcee233ed748dd584da04bc1a",
  "ggml/src/ggml-cpu/ggml-cpu.c": "ab0ea6a0c60297880d995284c63cfeb233f207368a5e6595a79ac01d1c0e4b0d",
  "ggml/src/ggml-cpu/vec.h": "9eafbc6f8a34ba59cbcd51ec84151c2f09c7a3ef90ebd20e3284f65fc98f4481",
  "ggml/src/ggml-cpu/vec.cpp": "a3cdfc079f6e1bf2fe341e494697d8f2eae42c187dee05e0ba85f597cfa7bdc1"
};
 const snapshots={};
 for(const [file,digest] of Object.entries(expected)){const content=await read('.local/native/source-timescale/'+file);assert.equal(hash(content),digest,file);snapshots[file]=content;}
 prepare();
 for(const [file,content] of Object.entries(snapshots))assert.equal(await read('.local/native/source-timescale/'+file),content,file);

});
