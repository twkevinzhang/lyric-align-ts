import {execFileSync} from 'node:child_process';
import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const local=resolve(import.meta.dirname,'../../../.local/whisper-poc');
const lock=JSON.parse(await readFile(resolve(import.meta.dirname,'../lock.json')));
const variant='grouped';
const src=resolve(local,`source-${variant}`);
try { await access(src); } catch { execFileSync('git',['clone','--shared',resolve(local,'source'),src]); }
if(execFileSync('git',['-C',src,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==lock.commit)throw Error('Commit mismatch');
const file='ggml/src/ggml-cpu/ggml-cpu.c';
let code=execFileSync('git',['-C',src,'show',`${lock.commit}:${file}`],{encoding:'utf8',maxBuffer:8e6});
function replace(anchor,value){if(code.split(anchor).length!==2)throw Error('Ambiguous anchor');code=code.replace(anchor,value);}
const kernel=await readFile(resolve(import.meta.dirname,'tiled-kernel.h'),'utf8');
replace('void ggml_compute_forward_mul_mat(',kernel+'\nvoid ggml_compute_forward_mul_mat(');
replace('    // nb01 >= nb00 - src0 is not transposed', '#if defined(__wasm_simd128__)\n    if (poc_packed_matmul(params, dst)) return;\n#endif\n    // nb01 >= nb00 - src0 is not transposed');
const anchor='                        const enum ggml_type vec_dot_type = type_traits_cpu[node->src[0]->type].vec_dot_type;';
replace(anchor,anchor+'\n#if defined(__wasm_simd128__)\n                        cur = poc_pack_size(node->src[0], node->src[1]);\n#endif');
replace('cur = ggml_row_size(vec_dot_type, ggml_nelements(node->src[1]));','cur = MAX(cur, ggml_row_size(vec_dot_type, ggml_nelements(node->src[1])));');
replace('    for(int64_t tile=p->ith;tile<mt*nt*b->ne[2]*b->ne[3];tile+=p->nth) {',`    const int64_t total=mt*nt*b->ne[2]*b->ne[3];
    for(int64_t group=p->ith;group<(total+3)/4;group+=p->nth)
    for(int64_t tile=group*4;tile<MIN(total,(group+1)*4);tile++) {`);
await writeFile(resolve(src,file),code);
await writeFile(resolve(local,'grouped-source.json'),JSON.stringify({commit:lock.commit,change:'Grouped F16 4x4 tiles with packed operands',sourceSha256:createHash('sha256').update(code).digest('hex')},null,2));
