import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {out,media,hash,lock,local,root} from './common.mjs';
import {parseSrt} from '../../../spike/app/lib/reference.ts';
import {linesFromWords,scoreLines,srt} from './score.mjs';
const referenceBytes=await readFile(resolve(media,'Original.srt'));
const reference=parseSrt(referenceBytes.toString('utf8'));
const lyricBytes=await readFile(resolve(media,'Original.txt'));
const lyrics=lyricBytes.toString('utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(Boolean);
const audioBytes=await readFile(resolve(media,'256k-16kHz-單聲道.wav'));
const names=process.argv.includes('--native-only')?['native']:['native','wasm'];
const results={};
for(const name of names){
  const run=JSON.parse(await readFile(resolve(out,`${name}.json`)));
  assert.equal(run.audioSha256,hash(audioBytes));assert.equal(run.lyricsSha256,hash(lyricBytes));assert.equal(run.modelSha256,lock.model.sha256);assert.equal(run.referenceUsedForInference,false);
  const lines=linesFromWords(lyrics,run.timeline,run.audioSeconds);
  const score=scoreLines(lines,reference);
  results[name]={...run,effectiveMaxTokensPerPart:Math.min(run.options.maxTokensPerPart,220),score};
  await writeFile(resolve(out,`${name}.srt`),srt(lines));
}
if(results.wasm){for(const key of ['audioSha256','lyricsSha256','pcmSha256','modelSha256','sourceSha256','options'])assert.deepEqual(results.native[key],results.wasm[key],key);assert.equal(results.wasm.browserInfo.crossOriginIsolated,true);}
const artifacts={};
const variant=results.wasm?.variant||'wasm';
for(const file of [`build-song-${variant}/parity.js`,`build-song-${variant}/parity.wasm`]) artifacts[file]=hash(await readFile(resolve(local,file)));
for(const file of ['poc/whisper/bridge.cpp','poc/whisper/song/worker.js','poc/whisper/song/serve.mjs']) artifacts[file]=hash(await readFile(resolve(root,file)));
const report={createdAt:new Date().toISOString(),referenceSha256:hash(referenceBytes),pocLock:lock,artifactSha256:artifacts,results,notes:[
  '歌詞引導對齊，文字由輸入提供，不是自由辨識準確率測試。標準 SRT 只在推論後使用。',
  `模型、PCM、歌詞與 Echogarden 3.4.0 對齊程式相同；CPU ${results.native.options.threadCount} 執行緒、medium 時間精度（10 heads）、temperature 0、無提示、無人聲分離、無 VAD 裁切。`,
  'maxTokensPerPart 請求 448；兩端官方程式均依其固定上限截為 220。未為本曲調整。',
  '官方為 Windows CPU DLL（20260720）；PoC 為固定 fork 的 Chrome WASM。官方 DLL 對應 commit 未驗證相同。',
  '官方 N-API 保留原始 logits 讀取行為；PoC 使用已修正的最後一列 logits。因此不是只差 CPU／WASM 的控制實驗。',
  'WASM 的模型推論在 Chrome；分段、tokenizer、解碼控制、DTW 在 Node.js，共用官方程式。尚非純瀏覽器實作。',
  '推論耗時包含模型初始化、完整對齊與 WASM 的本機傳輸；不含安裝、編譯、模型檔案傳入瀏覽器、音檔準備、評分。官方數字採用無同時編譯／WASM 推論的複測；非統計 benchmark。',
  'SRT 句尾可能包含停頓，逐詞對齊句尾則取最後一詞結束；仍照標準答案計算，不進行人工修正。',
]};
await writeFile(resolve(out,names.length===2?'comparison.json':'native-comparison.json'),JSON.stringify(report,null,2));
console.table(names.map(name=>({name,seconds:results[name].totalSeconds,usable:results[name].score.usable,startMean:results[name].score.start.meanAbs,startWithin1:results[name].score.start.withinOneSecond,endMean:results[name].score.end.meanAbs})));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>x==null?'—':x.toFixed(2);
const clock=s=>`${Math.floor(s/60)}:${(s%60).toFixed(2).padStart(5,'0')}`;
const signed=x=>x==null?'不可評分':`${Math.abs(x).toFixed(2)} 秒${x<0?'早':x>0?'晚':'一致'}`;
const label={native:'官方 Echogarden',wasm:'Chrome WASM PoC'};
const summary=names.map(name=>{const r=results[name],s=r.score;return `<tr><th>${label[name]}</th><td>${Math.floor(r.totalSeconds/60)} 分 ${(r.totalSeconds%60).toFixed(1)} 秒</td><td>${s.usable}/12</td><td>${num(s.start.meanAbs)} 秒</td><td>${s.start.withinOneSecond}/12</td><td>${num(s.end.meanAbs)} 秒</td><td>${num(s.end.maxAbs)} 秒</td></tr>`;}).join('');
const rows=reference.map((ref,i)=>`<tr><td>${i+1}</td><th>${esc(ref.text)}</th><td>${clock(ref.start)}–${clock(ref.end)}<br><button data-start="${ref.start}" data-end="${ref.end}">聽標準</button></td>${names.map(name=>{const r=results[name].score.rows[i];return `<td class="${r.usable&&Math.abs(r.startError)<=1?'ok':'bad'}">${clock(r.start)}–${clock(r.end)}<br>開始：${signed(r.startError)}<br>結束：${signed(r.endError)}<br>${r.issues.length?esc(r.issues.join(', ')):''}<button data-start="${r.start}" data-end="${r.end}">聽${name==='native'?'官方':'WASM'}</button></td>`;}).join('')}</tr>`).join('');
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Amazing Grace 字幕實測比較</title><style>
body{font:16px/1.65 system-ui,sans-serif;margin:0;background:#f4f5f7;color:#192333}main{max-width:1250px;margin:auto;padding:32px}h1{font-size:32px}h2{margin-top:32px}table{border-collapse:collapse;width:100%;background:white}th,td{text-align:left;padding:12px;border-bottom:1px solid #d8dde5;vertical-align:top}th{font-weight:600}.scroll{overflow-x:auto}.ok{background:#eff8f2}.bad{background:#fff0e8}button{font:inherit;border:1px solid #b5beca;border-radius:6px;background:white;padding:3px 9px;cursor:pointer;margin-top:6px}audio{width:min(700px,100%)}.player{position:sticky;top:0;background:#f4f5f7f5;padding:12px 0;z-index:2}.note{color:#536174;font-size:14px}a{color:#174fb6}li{margin:6px 0}</style><main>
<p>實際歌曲測試 · small 多語 Q5_1 · CPU ${results.native.options.threadCount} 執行緒</p><h1>Amazing Grace：字幕到底差幾秒？</h1>
<p>完整音檔 ${num(results.native.audioSeconds)} 秒，12 句歌詞。綠底表示句首與標準相差不超過 1 秒；橘底表示超過 1 秒或時間無效。</p>
<div class="player"><audio id="audio" controls preload="metadata" src="data:audio/wav;base64,${audioBytes.toString('base64')}"></audio><div id="playing" class="note">點每句的「聽標準／聽官方／聽 WASM」，從相應預測起點播放至句尾。</div></div>
<h2>整首比較</h2><div class="scroll"><table><thead><tr><th>執行方式</th><th>推論耗時</th><th>時間有效句數</th><th>句首平均差距</th><th>句首差距 ≤ 1 秒</th><th>句尾平均差距</th><th>句尾最大差距</th></tr></thead><tbody>${summary}</tbody></table></div>
<p class="note">時間有效只表示數值合法，並不表示唱對時間。歌詞是輸入答案，因此不以文字相同宣稱辨識正確。</p>
<h2>逐句播放與時間比較</h2><div class="scroll"><table><thead><tr><th>#</th><th>歌詞</th><th>標準答案</th>${names.map(n=>`<th>${label[n]}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
<h2>比較條件與限制</h2><ul>${report.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul><p>${names.map(n=>`<a href="${n}.srt" download>下載${label[n]}字幕</a>`).join(' · ')} · <a href="comparison.json">完整結果 JSON</a></p></main>
<script>const audio=document.querySelector('#audio');let stopAt=Infinity;document.querySelectorAll('button[data-start]').forEach(b=>b.onclick=()=>{stopAt=Number(b.dataset.end);audio.currentTime=Number(b.dataset.start);document.querySelector('#playing').textContent=b.closest('tr').querySelector('th').textContent+' · '+b.textContent;audio.play();});audio.addEventListener('timeupdate',()=>{if(audio.currentTime>=stopAt){audio.pause();stopAt=Infinity;}});</script></html>`;
await writeFile(resolve(out,names.length===2?'comparison.html':'native-comparison.html'),html);
