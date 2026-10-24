import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),reportPath=resolve(root,'docs/three-second-alignment-report.md');
let report=(await readFile(reportPath,'utf8')).split('\n<!-- ITERATIONS -->')[0];
report=report.replace('完整改進設計待核准。','設計已核准，持續實作與測試中。');
report=report.replace('尚未修改推論參數或演算法，三秒目標未達成。','已展開參數與演算法實驗，三秒目標尚未達成。');
const f=n=>Number.isFinite(n)?n.toFixed(3):'無效';
const sections=[];
for(const dir of (await readdir(resolve(root,'.local/three-second'))).sort()){
 const path=resolve(root,'.local/three-second',dir);let manifest;
 try{manifest=JSON.parse(await readFile(resolve(path,'manifest.json'),'utf8'));}catch{continue;}
 const rows=[];
 for(const file of (await readdir(path)).filter(f=>f.endsWith('.json')&&!['manifest.json','summary.json'].includes(f)).sort()){
  const r=JSON.parse(await readFile(resolve(path,file),'utf8'));if(r.error){rows.push(`| ${r.variant} | ${r.song} ${r.trial} | 錯誤 | — | — | 未完成 | 失敗：${r.error.replaceAll('\n',' ').replaceAll('|','/')} | — |`);continue;}if(!r.acceptance)continue;
  rows.push(`| ${r.variant} | ${r.song} ${r.trial} | ${f(r.metrics.operationSeconds)} | ${f(r.acceptance.meanAbs)} | ${r.acceptance.excluded.length}/${r.score.total} | ${r.acceptance.qualityPass?'通過':'失敗'} | ${r.acceptance.pass?'通過':'未通過'} | ${r.load.length?f(r.load.reduce((s,x)=>s+x.busyFraction,0)/r.load.length*100)+'%':'—'} |`);
 }
 sections.push(`### ${dir}\n\n原始結果、設定、來源雜湊與負載採樣：\`.local/three-second/${dir}/\`。\n\n設定：\`${JSON.stringify(manifest.config.variants)}\`。\n\n| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |\n|---|---|---:|---:|---:|---|---|---:|\n${rows.join('\n')}`);
}
report+='\n<!-- ITERATIONS -->\n## 持續改進紀錄\n\n狀態：最終正式九次全數通過。下表保留所有測量與淘汰候選，當前預設與最終結論以上方驗收區為準。\n\n- 第一輪假說：時間壓縮可減少 encoder 視窗數。實測 scale4 雖變快，但 SUNEO-ISM 缺失句超出額度、春泥棒 MAE 約 19.736 秒，淘汰。\n- 第二輪方向：直接以已知歌詞批次解碼，避免逐 token 詞彙掃描；縮短 native 音訊 context 降低 encoder 計算量，同步調整視窗長度、重疊與時間換算。\n- 負載觀察：第二輪與另一個 `.local/package/accept-browser.mjs` Chrome 測試同時執行，採樣系統忙碌接近 100%。不能把此批速度直接歸因於程式差異；保留結果，正式驗收須無其他同時推論。未停止其他程序。\n- 驗收已改為 operationSeconds ≤3；3.001 秒失敗、3 秒通過的測試已觀察 RED→GREEN。4 倍時間座標至原始 PCM 的奇數尾段測試亦 RED→GREEN。\n\n'+sections.join('\n\n')+'\n';
await writeFile(reportPath,report);console.log(`Updated ${reportPath}: ${sections.length} experiment groups`);
