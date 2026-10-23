import {execFileSync} from 'node:child_process';
import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {cachedWeightKernel} from './cached-weights.mjs';
const local=resolve(import.meta.dirname,'../../../.local/whisper-poc');
const src=resolve(local,'source-timescale');
async function writeChanged(path,data){
  const bytes=Buffer.from(data);
  try{if((await readFile(path)).equals(bytes))return;}catch(e){if(e.code!=='ENOENT')throw e;}
  await writeFile(path,bytes);
}
try{await access(src);}catch{execFileSync('git',['clone','--shared',resolve(local,'source'),src]);}
const lock=JSON.parse(await readFile(resolve(import.meta.dirname,'../lock.json'),'utf8'));
for(const source of [src,resolve(local,'source-compact')])if(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==lock.commit)throw Error('Source commit mismatch');
const quantFile='ggml/src/ggml-cpu/arch/wasm/quants.c';
await writeChanged(resolve(src,quantFile),await readFile(resolve(local,'source-compact',quantFile)));
const kernel=(await readFile(resolve(import.meta.dirname,'compact-kernel.h'),'utf8')).replaceAll('\r\n','\n');
const cpuFile=resolve(src,'ggml/src/ggml-cpu/ggml-cpu.c');
let cpu=(await readFile(resolve(local,'source-compact/ggml/src/ggml-cpu/ggml-cpu.c'),'utf8')).replaceAll('\r\n','\n');
if(cpu.split(kernel).length!==2)throw Error('Kernel source mismatch');
const cacheEnabled=process.env.SONG_BUILD_WEIGHT_CACHE==='1';
cpu=cacheEnabled?cpu.replace(kernel,cachedWeightKernel(kernel)):cpu+'\nvoid poc_compact_cache_clear(void) {}\n';
await writeChanged(cpuFile,cpu);
let code=await readFile(resolve(local,'source-compact/src/whisper.cpp'),'utf8');
function replaceOnce(a,b){if(code.split(a).length!==2)throw Error('Ambiguous source anchor: '+a);code=code.replace(a,b);}
replaceOnce('static struct ggml_cgraph * whisper_build_graph_decoder(',`static std::vector<int32_t> poc_vocab_subset;
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
    struct ggml_tensor * logits = ggml_mul_mat(ctx0, output_weights, cur);`);
replaceOnce('logits = ggml_graph_node(gf, -1);',`if(!poc_vocab_subset.empty()) {
            auto ids=ggml_graph_get_tensor(gf,"poc_vocab_ids");
            ggml_backend_tensor_set(ids,poc_vocab_subset.data(),0,poc_vocab_subset.size()*sizeof(int32_t));
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
if(code.split(batchAnchor).length!==2)throw Error('Ambiguous batch anchor');
code=code.replace(batchAnchor,batchAnchor+'\n    for (int i=0; i<n_tokens; ++i) state->batch.logits[i]=1;');
const anchor='int whisper_pcm_to_mel_with_state(';
if(code.split(anchor).length!==2)throw Error('Ambiguous mel injection anchor');
code=code.replace(anchor,`#include "/work/poc/whisper/song/compress-mel.h"
extern "C" int whisper_poc_set_audio_context(whisper_state* state,int frames) {
  if(frames!=375&&frames!=750&&frames!=1500)return -1;
  state->exp_n_audio_ctx=frames;return 0;
}
extern "C" int whisper_poc_compress_mel_with_state(whisper_state* state,int factor) {
  return poc_compress_mel(state->mel.data,state->mel.n_len,state->mel.n_len_org,state->mel.n_mel,factor);
}
`+anchor);
await writeChanged(resolve(src,'src/whisper.cpp'),code);
await writeFile(resolve(local,'timescale-source.json'),JSON.stringify({commit:lock.commit,cacheEnabled,change:'Temporal mel averaging; all batch logits; optional vocabulary subset and Q5 weight cache; configurable audio context; complete PCM retained',sourceSha256:createHash('sha256').update(code).digest('hex'),cpuSha256:createHash('sha256').update(cpu).digest('hex')},null,2));
