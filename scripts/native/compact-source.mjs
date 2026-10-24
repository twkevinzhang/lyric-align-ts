import {execFileSync} from 'node:child_process';
import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {local, lock, ensureVariant} from './paths.mjs';

execFileSync(process.execPath,[resolve(import.meta.dirname,'packed-source.mjs')]);
const variant='compact';
const src=resolve(local,`source-${variant}`);
await ensureVariant(src);
if(execFileSync('git',['-C',src,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==lock.commit)throw Error('Commit mismatch');
const file='ggml/src/ggml-cpu/ggml-cpu.c';
let code=await readFile(resolve(local,'source-grouped',file),'utf8');
function replace(a,b){if(code.split(a).length!==2)throw Error('Ambiguous anchor');code=code.replace(a,b);}
replace('void ggml_compute_forward_mul_mat(',await readFile(resolve(import.meta.dirname,'../../native/compact-kernel.h'),'utf8')+'\nvoid ggml_compute_forward_mul_mat(');
replace('if (poc_packed_matmul(params, dst)) return;','if (poc_packed_matmul(params, dst) || poc_compact_matmul(params, dst)) return;');
replace('cur = poc_pack_size(node->src[0], node->src[1]);','cur = MAX(poc_pack_size(node->src[0], node->src[1]),poc_compact_size(node->src[0], node->src[1]));');
const quantFile='ggml/src/ggml-cpu/arch/wasm/quants.c';
const original=execFileSync('git',['-C',src,'show',`${lock.commit}:${quantFile}`],{encoding:'utf8',maxBuffer:8e6});
const quant=original;
await writeFile(resolve(src,file),code);await writeFile(resolve(src,quantFile),quant);
await writeFile(resolve(local,`${variant}-source.json`),JSON.stringify({commit:lock.commit,change:'Grouped F16 plus compact byte Q5/Q8 blocks with preconverted scales; same qbyte 2x2 arithmetic and original edge grouping',sourceSha256:createHash('sha256').update(code).digest('hex'),quantSha256:createHash('sha256').update(quant).digest('hex')},null,2));
