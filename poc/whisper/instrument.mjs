import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const local = resolve(import.meta.dirname, '../../.local/whisper-poc');
const lock = JSON.parse(await readFile(resolve(import.meta.dirname, 'lock.json')));
const source = resolve(local, 'source-trace');
const actual = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (actual !== lock.commit) throw new Error('Trace checkout commit mismatch');
// Always derive from the pinned Git object, never repeatedly patch the generated file.
let text = execFileSync('git', ['-C', source, 'show', `${lock.commit}:src/whisper.cpp`], { encoding: 'utf8', maxBuffer: 8e6 });
const original = text;
const once = (s, old, replacement) => {
  if (s.split(old).length !== 2) throw new Error(`Instrumentation anchor not unique: ${old}`);
  return s.replace(old, replacement);
};
function section(start, end, edit) {
  const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error('Missing section');
  text = text.slice(0, a) + edit(text.slice(a, b)) + text.slice(b);
}
section('static struct ggml_cgraph * whisper_build_graph_conv(', 'static struct ggml_cgraph * whisper_build_graph_encoder(', s => {
  for (const [code, name] of [
    ['cur = ggml_conv_1d_ph(ctx0, model.e_conv_1_w, mel, 1, 1);', 'conv1-matmul'],
    ['cur = ggml_add(ctx0, cur, model.e_conv_1_b);', 'conv1-bias'],
    ['cur = ggml_conv_1d_ph(ctx0, model.e_conv_2_w, cur, 2, 1);', 'conv2-matmul'],
    ['cur = ggml_add(ctx0, cur, model.e_conv_2_b);', 'conv2-bias'],
  ]) s = once(s, code, `${code}\n            ggml_set_name(cur, "trace-${name}");`);
  s = s.replace('cur = ggml_gelu(ctx0, cur);', 'cur = ggml_gelu(ctx0, cur);\n            ggml_set_name(cur, "trace-conv1-gelu");');
  return s;
});
section('static struct ggml_cgraph * whisper_build_graph_encoder(', '// pre-compute cross-attention memory', s => {
  const mark = (code, variable, name, conditional = true) => {
    s = once(s, code, `${code}\n        ${conditional ? 'if (il == 0) ' : ''}ggml_set_name(${variable}, "trace-${name}");`);
  };
  mark('cur = ggml_add(ctx0, e_pe, ggml_cont(ctx0, ggml_transpose(ctx0, cur)));', 'cur', 'position', false);
  mark('cur = ggml_norm(ctx0, inpL, hparams.eps);', 'cur', 'layer00-attn-norm');
  mark('layer.attn_ln_0_b);', 'cur', 'layer00-attn-affine');
  for (const [letter, tag] of [['q', 'Qcur'], ['k', 'Kcur'], ['v', 'Vcur']]) {
    mark(`layer.attn_${letter}_w,\n                    cur);`, tag, `layer00-${letter}-matmul`);
  }
  mark('Qcur = ggml_add(ctx0, Qcur, layer.attn_q_b);', 'Qcur', 'layer00-q-bias');
  mark('Vcur = ggml_add(ctx0, Vcur, layer.attn_v_b);', 'Vcur', 'layer00-v-bias');
  mark('cur = ggml_cont_2d(ctx0, KQV_merged, n_state, n_ctx);', 'cur', 'layer00-attention');
  mark('layer.attn_ln_1_w,\n                    cur);', 'cur', 'layer00-projection-matmul');
  mark('cur = ggml_add(ctx0, cur, layer.attn_ln_1_b);', 'cur', 'layer00-projection-bias');
  mark('cur = ggml_add(ctx0, cur, inpL);', 'cur', 'layer00-attn-residual');
  mark('cur = ggml_norm(ctx0, inpFF, hparams.eps);', 'cur', 'layer00-ffn-norm');
  mark('layer.mlp_ln_b);', 'cur', 'layer00-ffn-affine');
  mark('layer.mlp_0_w,\n                    cur);', 'cur', 'layer00-ffn-up-matmul');
  mark('cur = ggml_add(ctx0, cur, layer.mlp_0_b);', 'cur', 'layer00-ffn-up-bias');
  mark('cur = ggml_gelu(ctx0, cur);', 'cur', 'layer00-ffn-gelu');
  mark('layer.mlp_1_w,\n                    cur);', 'cur', 'layer00-ffn-down-matmul');
  mark('cur = ggml_add(ctx0, cur, layer.mlp_1_b);', 'cur', 'layer00-ffn-down-bias');
  s = once(s, 'inpL = ggml_add(ctx0, cur, inpFF);', 'inpL = ggml_add(ctx0, cur, inpFF);\n        ggml_format_name(inpL, "trace-block-%02d", il);');
  mark('model.e_ln_b);', 'cur', 'encoder-output', false);
  return s;
});
section('static bool whisper_encode_internal(', 'static struct ggml_cgraph * whisper_build_graph_decoder(', s => {
  for (const phase of ['conv', 'encode']) s = once(s, `auto & sched = wstate.sched_${phase}.sched;`,
    `auto & sched = wstate.sched_${phase}.sched;\n        ggml_backend_sched_set_eval_callback(sched, poc_trace_capture, nullptr);`);
  const line = 'ggml_backend_tensor_set(mel, wstate.inp_mel.data(), 0, ggml_nelements(mel)*sizeof(float));';
  return once(s, line, `${line}\n            if (!poc_trace_capture(mel, false, nullptr)) return false;`);
});
text = once(text, 'static struct ggml_cgraph * whisper_build_graph_conv(', '#include "trace-hook.h"\n\nstatic struct ggml_cgraph * whisper_build_graph_conv(');
await writeFile(resolve(source, 'src/whisper.cpp'), text);
const sha = data => createHash('sha256').update(data).digest('hex');
await writeFile(resolve(local, 'instrumentation.json'), JSON.stringify({ commit: lock.commit,
  originalSha256: sha(original), instrumentedSha256: sha(text),
  hookSha256: sha(await readFile(resolve(import.meta.dirname, 'trace-hook.h'))) }, null, 2));
console.log('Generated trace source from pinned commit; inference expressions unchanged.');
