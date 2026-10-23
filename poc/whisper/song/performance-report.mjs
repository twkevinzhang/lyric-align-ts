import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {out,local} from './common.mjs';
import {selectThreads} from './thread-config.mjs';
const json=async p=>JSON.parse(await readFile(p));
const pair=await json(resolve(out,'comparison.json'));
const baseline=await json(resolve(local,'song/comparison.json'));
const generic=await json(resolve(local,'perf-calibrate-generic/calibration.json'));
const simd=await json(resolve(local,'perf-calibrate-simd/calibration.json'));
const selected=selectThreads(simd.measurements);
assert.equal(pair.results.native.options.threadCount,selected);
assert.equal(pair.results.wasm.options.threadCount,selected);
assert.equal(pair.results.wasm.variant,'simd');
assert.deepEqual(pair.results.wasm.buildHashes,simd.buildHashes);
assert.equal(generic.calibrationPcmSha256,simd.calibrationPcmSha256);
for(const item of [generic,simd,...Object.values(baseline.results),...Object.values(pair.results)]){
  for(const key of ['modelSha256','audioSha256','lyricsSha256','pcmSha256','sourceSha256'])assert.equal(item[key],pair.results.native[key],key);
  const {threadCount,...other}=item.options;
  const {threadCount:ignored,...expected}=pair.results.native.options;
  assert.deepEqual(other,expected);
}
const rows=[
  {label:'原版 WASM（通用量化核心）',...baseline.results.wasm},
  {label:'官方 Echogarden（單執行緒）',...baseline.results.native},
  {label:'改善後 WASM（專用核心）',...pair.results.wasm},
  {label:'官方 Echogarden（同執行緒數）',...pair.results.native},
];
const calibration=[];
for(const run of [generic,simd]){
  for(const threads of [...new Set(run.measurements.map(x=>x.threads))]){
    const values=run.measurements.filter(x=>x.threads===threads).map(x=>x.encoderMs).sort((a,b)=>a-b);
    calibration.push({variant:run.variant,threads,repeats:values.length,medianEncoderSeconds:(values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2000});
  }
}
const speedup=baseline.results.wasm.totalSeconds/pair.results.wasm.totalSeconds;
const relativeToOfficial=pair.results.wasm.totalSeconds/pair.results.native.totalSeconds;
const performanceReport={createdAt:new Date().toISOString(),selectedThreads:selected,selectionRule:'smallest thread count within 5% of fastest median first-30-second encoder',speedupVsPreviousWasm:speedup,relativeToSameThreadOfficial:relativeToOfficial,calibration,generic,simd,rows};
await writeFile(resolve(out,'performance.json'),JSON.stringify(performanceReport,null,2));
const fmt=n=>n.toFixed(2);
const summary=`<h2>改善前後與官方比較</h2><p>同一個模型、完整 ${fmt(pair.results.native.audioSeconds)} 秒音檔與歌詞。改善後 WASM 耗時縮短至原來的 ${fmt(100/speedup)}%，本次比同執行緒數官方版耗時 ${fmt(relativeToOfficial)} 倍。前兩列為先前單執行緒測量，後兩列為本次分開執行的整曲測量。</p><div class="scroll"><table><thead><tr><th>執行方式</th><th>計算執行緒</th><th>整曲推論耗時</th><th>句首平均差距</th><th>句尾平均差距</th><th>首尾皆 ≤ 1 秒</th></tr></thead><tbody>${rows.map(r=>`<tr><th>${r.label}</th><td>${r.options.threadCount}</td><td>${fmt(r.totalSeconds)} 秒</td><td>${fmt(r.score.start.meanAbs)} 秒</td><td>${fmt(r.score.end.meanAbs)} 秒</td><td>${r.score.bothWithinOneSecond}/12</td></tr>`).join('')}</tbody></table></div>`;
const diagnostics=`<h2>為什麼變快？</h2><p>原版已開啟 SIMD 指令，但 GGML 架構偵測落入通用量化核心。改善版選入 fork 原有的 WASM 量化核心，並把固定 1 執行緒改成可設定。以下只測相同前 30 秒的 encoder，不能當作整首字幕結果。依事前規則選擇 ${selected} 執行緒。</p><table><thead><tr><th>核心</th><th>執行緒</th><th>測量次數</th><th>encoder 中位耗時</th></tr></thead><tbody>${calibration.map(c=>`<tr><td>${c.variant==='simd'?'WASM 專用':'通用'}</td><td>${c.threads}</td><td>${c.repeats}</td><td>${fmt(c.medianEncoderSeconds)} 秒</td></tr>`).join('')}</tbody></table><p>主頁只做操作與進度；一個推論 Worker 持有唯一模型與共享 WASM 記憶體，負責序列化推論；預熱的 pthread Worker 池協助矩陣計算。執行緒數含推論 Worker 自己，因此 ${selected} 執行緒代表同時 ${selected} 個計算執行緒，不是 ${selected} 份模型。取消會終止擁有模型的 Worker 及其子 Worker，並拒絕後端待處理請求。</p><p><a href="performance.json">完整效能證據 JSON</a></p>`;
let html=await readFile(resolve(out,'comparison.html'),'utf8');
html=html.replace(/<h2>整首比較<\/h2>[\s\S]*?<p class="note">時間有效[\s\S]*?<\/p>/,summary);
const changed=pair.results.wasm.score.rows.map((w,i)=>({line:i+1,w,n:pair.results.native.score.rows[i]})).filter(({w,n})=>w.start!==n.start||w.end!==n.end);
const largest=changed.toSorted((a,b)=>Math.abs(b.w.end-b.n.end)-Math.abs(a.w.end-a.n.end))[0];
const quality=`<p><strong>字幕仍有差異：</strong>${12-changed.length}/12 句起訖與官方完全相同。${largest?`第 ${largest.line} 句結束差異最大：官方 ${fmt(largest.n.end)} 秒、WASM ${fmt(largest.w.end)} 秒、標準 ${fmt(largest.w.referenceEnd)} 秒。`:''}第一句兩端都從 ${fmt(pair.results.wasm.score.rows[0].start)} 秒開始，標準為 ${fmt(pair.results.wasm.score.rows[0].referenceStart)} 秒。核心與執行緒同時變更，尚未用整曲消融判定個別原因。</p>`;
html=html.replace('<h2>逐句播放與時間比較</h2>',quality+'<h2>逐句播放與時間比較</h2>');
html=html.replace('<h2>比較條件與限制</h2>',diagnostics+'<h2>比較條件與限制</h2>');
await writeFile(resolve(out,'comparison.html'),html);
console.table(rows.map(r=>({label:r.label,threads:r.options.threadCount,seconds:r.totalSeconds,startMAE:r.score.start.meanAbs,endMAE:r.score.end.meanAbs,bothWithin1:r.score.bothWithinOneSecond})));
console.table(calibration);console.log({selected,speedup,relativeToOfficial});
