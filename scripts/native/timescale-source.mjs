import {execFileSync} from 'node:child_process';
import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

import {local, lock, ensureVariant} from './paths.mjs';
const src=resolve(local,'source-timescale');
async function writeChanged(path,data){
  const bytes=Buffer.from(data);
  try{if((await readFile(path)).equals(bytes))return;}catch(e){if(e.code!=='ENOENT')throw e;}
  await writeFile(path,bytes);
}
await ensureVariant(src);

for(const source of [src,resolve(local,'source-compact')])if(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==lock.commit)throw Error('Source commit mismatch');
const quantFile='ggml/src/ggml-cpu/arch/wasm/quants.c';
await writeChanged(resolve(src,quantFile),await readFile(resolve(local,'source-compact',quantFile)));
const kernel=(await readFile(resolve(import.meta.dirname,'../../native/compact-kernel.h'),'utf8')).replaceAll('\r\n','\n');
const cpuFile=resolve(src,'ggml/src/ggml-cpu/ggml-cpu.c');
let cpu=(await readFile(resolve(local,'source-compact/ggml/src/ggml-cpu/ggml-cpu.c'),'utf8')).replaceAll('\r\n','\n');
if(cpu.split(kernel).length!==2)throw Error('Kernel source mismatch');
const cpuReplace=(a,b)=>{if(cpu.split(a).length!==2)throw Error('CPU profile anchor mismatch');cpu=cpu.replace(a,b);};
cpuReplace('static thread_ret_t ggml_graph_compute_thread(void * data) {',(await readFile(resolve(import.meta.dirname,'../../native/kernel-profile.h'),'utf8')).replaceAll('\r\n','\n')+'\nstatic thread_ret_t ggml_graph_compute_thread(void * data) {');
cpuReplace('        const int n_fused = ggml_cpu_try_fuse_ops','        const int64_t poc_node_start=poc_kernel_enabled && state->ith==0?ggml_time_us():0;\n        const int n_fused = ggml_cpu_try_fuse_ops');
const barrier='        if (node_n + 1 < cgraph->n_nodes) {\n            ggml_barrier(state->threadpool);\n        }';
cpuReplace(barrier,barrier+'\n        if(poc_kernel_enabled && state->ith==0)poc_kernel_times[poc_kernel_category(node)]+=ggml_time_us()-poc_node_start;');
let vectorHeader=(await readFile(resolve(local,'source-compact/ggml/src/ggml-cpu/vec.h'),'utf8')).replaceAll('\r\n','\n');
vectorHeader=vectorHeader.replace('#include "ggml-cpu.h"','#include "ggml-cpu.h"\n'+(await readFile(resolve(import.meta.dirname,'../../native/wasm-activations.h'),'utf8')).replaceAll('\r\n','\n'));
const geluAnchor='inline static void ggml_vec_gelu_f32(const int n, float * y, const float * x) {';
if(vectorHeader.split(geluAnchor).length!==3)throw Error('GELU vector anchor');
vectorHeader=vectorHeader.replaceAll(geluAnchor,geluAnchor+'\n#if defined(__wasm_simd128__)\n    if(poc_vector_activations){poc_vector_gelu(n,y,x);return;}\n#endif');
await writeChanged(resolve(src,'ggml/src/ggml-cpu/vec.h'),vectorHeader);
let vectorCode=(await readFile(resolve(local,'source-compact/ggml/src/ggml-cpu/vec.cpp'),'utf8')).replaceAll('\r\n','\n');
vectorCode=vectorCode.replace('#include "vec.h"','#include "vec.h"\n#if defined(__wasm_simd128__)\nbool poc_vector_activations=false;\nextern "C" int poc_set_vector_activations(int enabled){if(enabled!=0&&enabled!=1)return -1;poc_vector_activations=enabled!=0;return 0;}\n#endif');
const softmaxAnchor='ggml_float ggml_vec_soft_max_f32(const int n, float * y, const float * x, float max) {';
if(vectorCode.split(softmaxAnchor).length!==2)throw Error('Softmax vector anchor');
vectorCode=vectorCode.replace(softmaxAnchor,softmaxAnchor+'\n#if defined(__wasm_simd128__)\n    if(poc_vector_activations)return poc_vector_softmax(n,y,x,max);\n#endif');
await writeChanged(resolve(src,'ggml/src/ggml-cpu/vec.cpp'),vectorCode);
const cacheEnabled=true;
await writeChanged(cpuFile,cpu);
let code=(await readFile(resolve(local,'source-compact/src/whisper.cpp'),'utf8')).replaceAll('\r\n','\n');
function replaceOnce(a,b){if(code.split(a).length!==2)throw Error('Ambiguous source anchor: '+a);code=code.replace(a,b);}
replaceOnce('static struct ggml_cgraph * whisper_build_graph_encoder(',`#include "local-attention.h"
static int poc_encoder_blocks=1;
extern "C" int poc_set_encoder_blocks(int blocks){if(blocks!=1&&blocks!=2&&blocks!=4)return -1;poc_encoder_blocks=blocks;return 0;}
static struct ggml_cgraph * whisper_build_graph_encoder(`);
const encoderStart=code.indexOf('static struct ggml_cgraph * whisper_build_graph_encoder('),encoderEnd=code.indexOf('// projection',encoderStart);
const encoderAttention=code.slice(encoderStart,encoderEnd);
if(encoderAttention.split('if (wctx.params.flash_attn) {').length!==2)throw Error('Local attention encoder anchor');
code=code.slice(0,encoderStart)+encoderAttention.replace('if (wctx.params.flash_attn) {',`if (poc_encoder_blocks>1 && !wctx.params.flash_attn) {
                cur=poc_local_attention(ctx0,Qcur,Kcur,Vcur,n_head,n_ctx,poc_encoder_blocks,wctx.itype,KQscale);
            } else if (wctx.params.flash_attn) {`)+code.slice(encoderEnd);
const fft25=(await readFile(resolve(import.meta.dirname,'../../native/fft25.h'),'utf8')).replaceAll('\r\n','\n').replace('#pragma once','');
replaceOnce('static void fft(float* in, int N, float* out) {',fft25+'\nstatic void fft(float* in, int N, float* out) {\n    if(N==25 && SIN_COS_N_COUNT==400){poc_fft25(in,out,global_cache.cos_vals,global_cache.sin_vals);return;}');
replaceOnce('static void log_mel_spectrogram_worker_thread(', '#include "sparse-mel.h"\nstatic void log_mel_spectrogram_worker_thread(');
replaceOnce('    int n_fft = filters.n_fft;', '    int n_fft = filters.n_fft;\n    std::vector<PocMelRange> melRanges(mel.n_mel);\n    for(int j=0;j<mel.n_mel;j++)melRanges[j]=poc_mel_range(filters.data.data()+j*n_fft,n_fft);');
replaceOnce("            double sum = 0.0;\n            // unroll loop (suggested by GH user @lunixbochs)\n            int k = 0;\n            for (k = 0; k < n_fft - 3; k += 4) {\n                sum +=\n                        fft_out[k + 0] * filters.data[j * n_fft + k + 0] +\n                        fft_out[k + 1] * filters.data[j * n_fft + k + 1] +\n                        fft_out[k + 2] * filters.data[j * n_fft + k + 2] +\n                        fft_out[k + 3] * filters.data[j * n_fft + k + 3];\n            }\n            // handle n_fft remainder\n            for (; k < n_fft; k++) {\n                sum += fft_out[k] * filters.data[j * n_fft + k];\n            }\n",'            double sum = poc_mel_dot(fft_out.data(),filters.data.data()+j*n_fft,n_fft,melRanges[j]);\n');
replaceOnce('static struct ggml_cgraph * whisper_build_graph_decoder(',`static std::vector<int32_t> poc_vocab_subset;
static bool poc_alignment_only = false;
extern "C" int poc_get_alignment_only() { return poc_alignment_only ? 1 : 0; }
extern "C" int poc_set_alignment_only(int enabled) {
  if(enabled!=0 && enabled!=1)return -1;
  poc_alignment_only=enabled!=0;return 0;
}
extern "C" int whisper_poc_set_vocab_subset(const int32_t* ids,int count) {
  if(count<0 || count>51865)return -1;
  if(count==0){poc_vocab_subset.clear();return 0;}
  for(int i=0;i<count;i++)if(ids[i]<0||ids[i]>=51865||(i&&ids[i]<=ids[i-1]))return -1;
  poc_vocab_subset.assign(ids,ids+count);return 0;
}
static struct ggml_cgraph * whisper_build_graph_decoder(`);
replaceOnce('struct ggml_tensor * logits = ggml_mul_mat(ctx0, model.d_te, cur);',`struct ggml_tensor * output_weights=model.d_te;
    if(!poc_vocab_subset.empty()) {
        auto ids=ggml_new_tensor_1d(ctx0,GGML_TYPE_I32,poc_vocab_subset.size());
        ggml_set_name(ids,"poc_vocab_ids");ggml_set_input(ids);
        output_weights=ggml_get_rows(ctx0,model.d_te,ids);
    }
    struct ggml_tensor * logits = poc_alignment_only && poc_vocab_subset.size()==1 && aheads_cross_QKs != nullptr
        ? ggml_scale(ctx0, ggml_cont(ctx0, ggml_view_2d(ctx0, aheads_cross_QKs, 1, n_tokens, sizeof(float), 0)), 0.0f)
        : ggml_mul_mat(ctx0, output_weights, cur);`);
replaceOnce('logits = ggml_graph_node(gf, -1);',`if(!poc_vocab_subset.empty()) {
            auto ids=ggml_graph_get_tensor(gf,"poc_vocab_ids");
            if(ids)ggml_backend_tensor_set(ids,poc_vocab_subset.data(),0,poc_vocab_subset.size()*sizeof(int32_t));
        }
        logits = ggml_graph_node(gf, -1);`);
replaceOnce('ggml_backend_tensor_get(logits, logits_out.data() + (n_vocab*i), sizeof(float)*(n_vocab*i), sizeof(float)*n_vocab);',`if(poc_vocab_subset.empty()) {
            ggml_backend_tensor_get(logits, logits_out.data() + (n_vocab*i), sizeof(float)*(n_vocab*i), sizeof(float)*n_vocab);
        } else {
            std::vector<float> selected(poc_vocab_subset.size());
            ggml_backend_tensor_get(logits,selected.data(),sizeof(float)*selected.size()*i,sizeof(float)*selected.size());
            std::fill(logits_out.begin()+n_vocab*i,logits_out.begin()+n_vocab*(i+1),-INFINITY);
            for(size_t j=0;j<selected.size();j++)logits_out[n_vocab*i+poc_vocab_subset[j]]=selected[j];
        }`);
const batchAnchor='whisper_batch_prep_legacy(state->batch, tokens, n_tokens, n_past, 0);';
replaceOnce('    logits_out.resize(n_tokens*n_vocab);','    if(poc_alignment_only) { logits_out.clear(); } else {\n    logits_out.resize(n_tokens*n_vocab);');
replaceOnce('    if (batch.n_tokens > 1) {','    } // Optional alignment-only mode has no vocabulary output.\n    if (batch.n_tokens > 1) {');
if(code.split(batchAnchor).length!==2)throw Error('Ambiguous batch anchor');
code=code.replace(batchAnchor,batchAnchor+'\n    for (int i=0; i<n_tokens; ++i) state->batch.logits[i]=1;');
const anchor='int whisper_pcm_to_mel_with_state(';
if(code.split(anchor).length!==2)throw Error('Ambiguous mel injection anchor');
code=code.replace(anchor,`#include "compress-mel.h"
extern "C" int poc_compact_cache_add(const struct ggml_tensor*);
extern "C" int poc_group_cache_add(const struct ggml_tensor*);
extern "C" int whisper_poc_prepack_group_model(whisper_context* ctx) {
  if(!ctx)return -1;int count=0;for(const auto& entry:ctx->model.tensors)count+=poc_group_cache_add(entry.second);return count;
}
extern "C" int whisper_poc_prepack_model(whisper_context* ctx) {
  if(!ctx)return -1;
  int count=0;for(const auto& entry:ctx->model.tensors)count+=poc_compact_cache_add(entry.second);
  return count;
}
extern "C" int whisper_poc_set_audio_context(whisper_state* state,int frames) {
  if(frames<1||frames>1500)return -1;
  state->exp_n_audio_ctx=frames;return 0;
}
extern "C" int whisper_poc_compress_mel_with_state(whisper_state* state,double factor) {
  return poc_compress_mel(state->mel.data,state->mel.n_len,state->mel.n_len_org,state->mel.n_mel,factor);
}
`+anchor);
await writeChanged(resolve(src,'src/whisper.cpp'),code);
await writeFile(resolve(local,'timescale-source.json'),JSON.stringify({commit:lock.commit,cacheEnabled,change:'Fractional mel averaging, exact sparse mel and radix-five FFT, dynamic context, alignment-only graph and no unused vocabulary output',sourceSha256:createHash('sha256').update(code).digest('hex'),cpuSha256:createHash('sha256').update(cpu).digest('hex')},null,2));
