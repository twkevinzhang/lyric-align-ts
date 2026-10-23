import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {acceptance} from './acceptance.mjs';
import {scoreCues} from './cue-score.mjs';
import {songs,mediaRoot} from './three-song-config.mjs';
import {parseSrt} from '../../../spike/app/lib/reference.ts';
import {spokenLyrics} from './lyrics.mjs';
const root=resolve(import.meta.dirname,'../../..'),local=resolve(root,'.local/whisper-poc');
const experiments=[];
const invalidated=[];
for(const name of await readdir(local)){
  if(!name.startsWith('speed-')||name.includes('.'))continue;
  try{
    try{invalidated.push({folder:name,...JSON.parse(await readFile(resolve(local,name,'invalidated.json')))});continue;}catch(e){if(e.code!=='ENOENT')throw e;}
    const folder=resolve(local,name),run=JSON.parse(await readFile(resolve(folder,'wasm.json'))),evaluation=JSON.parse(await readFile(resolve(folder,'evaluation.json')));
    if(run.runId!==evaluation.runId)throw Error('Mismatched run/evaluation');
    const song=songs.find(s=>s.id===evaluation.song);
    const reference=parseSrt(await readFile(resolve(mediaRoot,song.directory,song.reference),'utf8'));
    evaluation.score=scoreCues(run,run.annotationPolicy==='strip-translations'?reference.map(r=>({...r,text:spokenLyrics(r.text)})):reference);
    const gate=acceptance(run.totalSeconds,evaluation.score.rows.map(r=>({...r,startError:r.error})));
    experiments.push({folder,experiment:evaluation.experiment,song:evaluation.song,createdAt:evaluation.createdAt,model:run.options.model,seconds:run.totalSeconds,initialization:run.initializationSeconds,encoder:run.metrics.encoderOnlyMs/1000,decoder:run.metrics.decodeMs/1000,rpc:run.metrics.rpcMs/1000,encodeCalls:run.metrics.encodeCalls,decodeCalls:run.metrics.decodeCalls,matched:evaluation.score.matched,total:evaluation.score.total,acceptance:gate});
    const cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
    await writeFile(resolve(folder,'cues.csv'),'\uFEFF'+[['line','text','usable','referenceStart','predictedStart','startError','excluded'],...evaluation.score.rows.map(r=>[r.line,r.text,r.usable,r.referenceStart,r.start,r.error,gate.excluded.some(e=>e.line===r.line)])].map(r=>r.map(cell).join(',')).join('\n'));
  }catch(e){if(e.code!=='ENOENT')throw e;}
}
experiments.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
await mkdir(resolve(root,'docs'),{recursive:true});
let finalValidation;
try{finalValidation=JSON.parse(await readFile(resolve(local,'final-validation.json')));}catch(e){if(e.code!=='ENOENT')throw e;}
let md=`# 三曲 10 秒改善實測\n\n更新：${new Date().toISOString()}。尚未達成三曲驗收。下表每列為一次實際完整 Chrome CPU/WASM 推論，非穩定性保證。\n\n每首 ≤10 秒（含初始化、對齊、RPC；不含音檔解碼、模型傳入與編譯）。最多排除 floor(N×10%) 句，缺漏先占額度；保留句首 MAE ≤1 秒。句尾不影響驗收。參考時間未用於推論。\n\n| 實驗 | 歌曲 | 模型 | 秒 | encoder 秒 | decoder 秒 | 配對 | 排除數 | 保留 MAE 秒 | 品質 | 通過 |\n|---|---|---|---:|---:|---:|---:|---:|---:|---|---|\n`;
if(finalValidation?.pass){
 md=md.replace('尚未達成三曲驗收。','已完成三曲各三次正式驗收，九次全部通過。');
 const summary='## 固定候選正式驗收\n\n'+`獨立重評分時間：${finalValidation.createdAt}。設定指紋：\`${finalValidation.configurationSha256}\`。九次使用相同推論程式、WASM、模型與參數；各曲輸入雜湊一致，生命週期檢查通過。\n\n| 輪次 | 歌曲 | 耗時秒 | 保留句首 MAE 秒 | 排除句號 | 通過 |\n|---|---|---:|---:|---|---|\n`+finalValidation.records.map(r=>`| ${r.experiment} | ${r.song} | ${r.seconds.toFixed(3)} | ${r.meanAbs.toFixed(3)} | ${r.excluded.map(x=>x.line).join(', ')} | ${r.pass?'通過':'失敗'} |`).join('\n')+'\n\n';
 md=md.replace('| 實驗 |',summary+'## 改善實驗實測\n\n| 實驗 |');
}
for(const e of experiments)md+=`| ${e.experiment} | ${e.song} | ${e.model} | ${e.seconds.toFixed(3)} | ${e.encoder.toFixed(3)} | ${e.decoder.toFixed(3)} | ${e.matched}/${e.total} | ${e.acceptance.excluded.length} | ${e.acceptance.meanAbs?.toFixed(3)??'無效'} | ${e.acceptance.qualityPass?'通過':'失敗'} | ${e.acceptance.pass?'通過':'失敗'} |\n`;
md+='\nRPC 時間涵蓋模型計算，不能與 encoder/decoder 相加。Worker 模式的 decoder 秒包含整段解碼控制與序列化；Node 模式只有各次模型呼叫，兩者不能直接當作純模型加速比。初始化、參數、原始碼與模型雜湊、呼叫數及排除句明細見本機 JSON/CSV。原始資料：`.local/whisper-poc/speed-<實驗>-<歌曲>/`，每組包含 wasm.json、evaluation.json、cues.csv、生命週期及日誌。\n\n';
try{md+=await readFile(resolve(local,'speed-decisions.md'),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
if(invalidated.length)md+='\n排除無效量測（不列入速度或品質結論）：\n'+invalidated.map(r=>`- ${r.folder}: ${r.reason}`).join('\n')+'\n';
await writeFile(resolve(local,'speed-summary.json'),JSON.stringify(experiments,null,2));
await writeFile(resolve(root,'docs/ten-second-alignment-report.md'),md);
console.log(md);
