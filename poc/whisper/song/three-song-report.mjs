import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {songs,mediaRoot} from './three-song-config.mjs';
import {parseSrt} from '../../../spike/app/lib/reference.ts';
import {srt} from './score.mjs';
import {scoreCues as score} from './cue-score.mjs';
const local=resolve(import.meta.dirname,'../../../.local/whisper-poc');
const destination=resolve(local,'eval-three-report');await mkdir(destination,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const report={createdAt:new Date().toISOString(),songs:[],notes:[
 '本版預設指本次採用的 compact12 WASM PoC、8 計算執行緒；不是尚未遷移的 ONNX 主線。',
 'CER 不適用：提供歌詞的引導對齊，未另跑自由辨識。',
 '歌詞配對成功定義為該 SRT 區塊文字完整對應輸出詞，且詞起點有效、無 confidence=0 的補齊詞；不代表時間正確。',
 '以 SRT 區塊為一句；使用單調字元編輯距離配對，文字缺漏句計失敗。句首取第一個對應詞起點，未插值或使用標準時間修正。',
 '最大起點誤差包含所有成功配對句，沒有排除離群值；失敗句不算入誤差，但保留在分母。句尾不評分。',
 'small 多語 Q5_1、CPU 8 執行緒、medium timestamp accuracy；Amazing Grace en，另外兩首 ja。SUNEO-ISM 的括號翻譯原樣保留。',
 '三組同歌詞同參數。本版及相同 PCM 組輸入同一 16 kHz 單聲道 WAV 解出的 Float32 PCM，並驗證 SHA256。原始音檔組由 Echogarden 解碼原始容器為 16 kHz 單聲道。',
 '推論耗時包含模型初始化與完整對齊，本版包含 RPC；不含檔案解碼、模型傳入瀏覽器、編譯或評分。解碼準備耗時另列。',
 '每種條件一次，依序執行；保留使用者現有多工工作。背景負載未固定，因此耗時不是穩定性保證。',
 'WASM 模型在 Chrome，tokenizer／解碼控制／DTW 仍在 Node。官方 DLL commit 未核實等於 fork；官方保留原始 logits 讀取，WASM 使用最後 token 列。',
 '春泥棒只從 SRT 抽取文字供推論，所有參考時間僅事後評分。',
]};
let md='# 三首歌曲實測評估\n\n';
for(const song of songs){
 const referenceBytes=await readFile(resolve(mediaRoot,song.directory,song.reference));const reference=parseSrt(referenceBytes.toString('utf8'));
 const entry={...song,referenceSha256:hash(referenceBytes),results:[]};
 for(const [kind,file,label] of [['pcm','wasm','本版預設'],['pcm','native','Echogarden：相同 PCM'],['original','native','Echogarden：原始音檔']]){
 const folder=resolve(local,`eval-three-${song.id}-${kind}`);const bytes=await readFile(resolve(folder,`${file}.json`));const run=JSON.parse(bytes);
 assert.equal(run.audioSha256,hash(await readFile(run.audioPath)));
 assert.equal(run.lyricsSha256,hash(await readFile(run.lyricsPath)));
 assert.equal(run.referenceUsedForInference,false);
 const exit=file==='native'?JSON.parse(await readFile(resolve(folder,'native-exit.json'))):null;
 if(exit)assert.equal(exit.resultSha256,hash(bytes));
 const scored=score(run,reference);entry.results.push({label,path:resolve(folder,`${file}.json`),resultSha256:hash(bytes),run,exit,score:scored});
 await writeFile(resolve(destination,`${song.id}-${file}-${kind}.srt`),srt(scored.rows));
 const csvCell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 await writeFile(resolve(destination,`${song.id}-${file}-${kind}.csv`),'\uFEFF'+[['句序','歌詞','配對成功','標準起點','預測起點','起點誤差秒'],...scored.rows.map(r=>[r.line,r.text,r.usable,r.referenceStart,r.start,r.error])].map(r=>r.map(csvCell).join(',')).join('\n'));
 }
 const [wasm,pcm,original]=entry.results;
 for(const key of ['pcmSha256','audioSha256','modelSha256','inferenceLyricsSha256','options','language'])assert.deepEqual(wasm.run[key],pcm.run[key],key);
 for(const key of ['modelSha256','inferenceLyricsSha256','options','language'])assert.deepEqual(pcm.run[key],original.run[key],key);
 assert.equal(wasm.run.variant,'compact12');assert.equal(wasm.run.browserInfo.crossOriginIsolated,true);
 if(report.songs.length)assert.deepEqual(wasm.run.buildHashes,report.songs[0].results[0].run.buildHashes);
 const values=entry.results;const row=(label,f)=>`| ${label} | ${values.map(f).join(' | ')} |\n`;
 md+=`## ${song.name}\n\n| 指標 | 本版預設 | Echogarden：相同 PCM | Echogarden：原始音檔 |\n|---|---:|---:|---:|\n`;
 md+=row('字元錯誤率 CER ↓',()=> '不適用');
 md+=row('歌詞配對成功',x=>`${x.score.matched}/${x.score.total}`);
 md+=row('起點誤差 ≤1 秒',x=>`${x.score.withinOne}/${x.score.total}`);
 md+=row('最大起點誤差¹',x=>`${x.score.max?.toFixed(3)??'—'} 秒`);
 md+=row('推論耗時',x=>`${x.run.totalSeconds.toFixed(1)} 秒`);
 md+=row('音檔解碼準備（另計）',x=>`${x.run.audioPreparationSeconds.toFixed(2)} 秒`);
 md+=row('程序退出',x=>x.exit?(x.exit.exitCode===0?'正常':`結果已寫出；退出碼 ${x.exit.exitCode}`):'完成');md+='\n';report.songs.push(entry);
}
md+='¹ 最大誤差不排除離群句。\n\n'+report.notes.map(x=>'- '+x).join('\n')+'\n';
await writeFile(resolve(destination,'evaluation.json'),JSON.stringify(report,null,2));await writeFile(resolve(destination,'evaluation.md'),md);console.log(md);
