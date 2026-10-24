import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseSrt} from '../src/subtitles.ts';
import {boundaryAcceptance,boundaryErrors} from '../src/core/boundary-acceptance.mjs';
const directory=resolve(process.argv[2]);
const {results,manifest}=JSON.parse(await readFile(resolve(directory,'summary.json'),'utf8'));
const statistics=values=>{
 const a=values.filter(Number.isFinite).map(Math.abs).sort((a,b)=>a-b),complete=a.length>0&&a.length===values.length;
 return {count:values.length,invalid:values.length-a.length,mae:complete?a.reduce((s,x)=>s+x,0)/a.length:null,p90:complete?a[Math.ceil(a.length*.9)-1]:null,
  within250:a.filter(x=>x<.25).length,within500:a.filter(x=>x<.5).length,within1000:a.filter(x=>x<1).length};
};
const analysis=[];
for(const result of results){
 if(result.error){analysis.push({variant:result.variant,song:result.song,error:result.error});continue;}
 const song=manifest.config.songs.find(s=>s.id===result.song);
 const reference=parseSrt(await readFile(song.reference,'utf8'));
 const excluded=new Set(result.acceptance.excluded.map(r=>r.line));
 const rows=boundaryErrors(result.score.rows,reference,result.audioSeconds).map(r=>({...r,referenceEnd:reference[r.line-1].end,excluded:excluded.has(r.line)}));
 const valid=rows.filter(r=>r.usable&&Number.isFinite(r.error)&&Number.isFinite(r.endError));
 const gate=boundaryAcceptance(result.metrics.operationSeconds,rows.map(r=>({...r,startError:r.error})),manifest.config.maximumSeconds??3);
 const item={variant:result.variant,trial:result.trial,song:result.song,seconds:result.metrics.operationSeconds,pass:gate.pass,boundaryAcceptance:gate,
  startKept:result.acceptance.meanAbs,endKept:result.endMeanAbs,startAll:statistics(rows.map(r=>r.usable?r.error:null)),endAll:statistics(rows.map(r=>r.endError)),
  both500:valid.filter(r=>Math.abs(r.error)<=.5+1e-9&&Math.abs(r.endError)<=.5+1e-9).length,
  invalid:rows.length-valid.length,zero:rows.filter(r=>r.start!==null&&r.start===r.end).length,rows};
 analysis.push(item);
 console.log(JSON.stringify({...item,rows:undefined,first:rows[0]?.start,lastEnd:rows.at(-1)?.end}));
}
await writeFile(resolve(directory,'boundary-analysis.json'),JSON.stringify(analysis,null,2));
