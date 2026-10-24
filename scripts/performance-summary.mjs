import {acceptance} from '../src/core/acceptance.mjs';
const f=value=>Number.isFinite(value)?value.toFixed(3):'無效';
export function renderPerformanceReport({manifest,results},evidence){
 const config=manifest.config,maximum=config.maximumSeconds??3,expected=new Set();
 for(const variant of config.variants??[{id:'production'}])for(let trial=1;trial<=(config.trials??1);trial++)for(const song of config.songs)expected.add(`${variant.id}/${song.id}/${trial}`);
 const seen=new Set();let complete=results.length===expected.size;
 const assessed=results.map(result=>{
  const key=`${result.variant}/${result.song}/${result.trial}`;
  if(seen.has(key)||!expected.has(key))complete=false;seen.add(key);
  const gate=result.score&&result.metrics?acceptance(result.metrics.operationSeconds,result.score.rows.map(row=>({...row,startError:row.error})),maximum):undefined;
  return{result,gate};
 });
 complete&&=seen.size===expected.size;
 const passed=assessed.filter(row=>row.gate?.pass).length;
 const lines=assessed.map(({result:r,gate:g})=>`| ${r.song} / ${r.trial} | ${f(r.metrics?.alignmentSeconds)} | ${f(r.metrics?.operationSeconds)} | ${f(g?.meanAbs)} | ${g?.excluded.length??'—'}/${r.score?.total??'—'} | ${g?.timePass?'通過':'失敗'} | ${g?.qualityPass?'通過':'失敗'} | ${g?.pass?'通過':'失敗'} |`);
 return `# 歌曲對齊效能現況\n\n狀態：${passed}/${expected.size} 通過${complete?'':'；測量未完整或含重複項目'}。門檻為每次 operationSeconds ≤${maximum} 秒，品質亦須通過。\n\n測量建立時間：${manifest.createdAt}。CPU：${manifest.cpu}；Chrome：${manifest.browser}；Node：${manifest.node??'未記錄'}。\n\n計時包含完整音訊準備、歌詞引導推論、Worker 往返、cue/SRT 整理；模型初始化、輸入下載與事後評分在計時外。每次新實例、未跑歌曲暖機；不排除慢速執行。每首最多排除 floor(參考句數×10%)，無效句先占額度，其餘句首 MAE ≤1 秒；句尾不作門檻。\n\n| 歌曲 / 次數 | 引擎推論秒 | operation 秒 | 句首 MAE 秒 | 排除 / 參考句數 | 速度 | 品質 | 完整驗收 |\n|---|---:|---:|---:|---:|---|---|---|\n${lines.join('\n')}\n\n原始輸出、環境、來源／模型／輸入雜湊、負載與逐句評分：\`${evidence}\`。重現使用該資料夾 manifest.json 的 config；benchmark 設 maximumSeconds=3 或 10，任一失敗以非零狀態結束。\n\n此處只驗證 createAligner 的已知歌詞引導路徑，不代表 session 自由 ASR 或 yt-subtitle 無時間碼全曲流程達標；後者要求所有必要行均匹配，不採10%排除。其他硬體、背景負載及未見曲目不由這組測量推定。版本切換與契約相容範圍見 [實作相容性](implementation-compatibility.md)。\n`;
}
