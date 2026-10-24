// Offline feasibility only: saved probabilities are never inference inputs.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseSrt} from '../src/subtitles.ts';
import {boundaryAcceptance} from '../src/core/boundary-acceptance.mjs';
const directory=resolve(process.argv[2]);
const {results,manifest}=JSON.parse(await readFile(resolve(directory,'summary.json'),'utf8'));
const vad=JSON.parse(await readFile(process.argv[3],'utf8'));
const output=[];
for(const run of results){
 if(run.error)continue;
 const signal=vad.find(v=>v.song===run.song);
 if(!signal||Math.abs(signal.audioSeconds-run.audioSeconds)>1/16000)throw Error('Missing or mismatched VAD audio');
 const song=manifest.config.songs.find(s=>s.id===run.song);
 const ref=parseSrt(await readFile(song.reference,'utf8'));
 const nearest=(list,time)=>{let value=time,d=1.5;for(const t of list)if(Math.abs(t-time)<d){value=t;d=Math.abs(t-time);}return value;};
 for(const mode of ['ends','both','active-end']){
  const rows=run.score.rows.map((r,i)=>{
   let start=mode==='both'?nearest(signal.starts,r.start):r.start,end=nearest(signal.ends,r.end);
   if(mode==='active-end'){
    const region=signal.starts.findIndex((a,k)=>a<=r.end&&signal.ends[k]>=r.end);
    if(region>=0)end=Math.min(signal.ends[region],run.score.rows[i+1]?.start??signal.audioSeconds);
   }
   if(end<start){start=r.start;end=r.end;}
   return {...r,start,end,startError:r.usable&&Number.isFinite(start)?start-ref[i].start:null,endError:r.usable&&Number.isFinite(end)&&end>=start&&end<=run.audioSeconds?end-ref[i].end:null};
  });
  const gate=boundaryAcceptance(NaN,rows);
  output.push({variant:run.variant,song:run.song,mode,start:gate.start,end:gate.end,qualityPass:gate.qualityPass,
   note:'Offline quality diagnostic only. No end-to-end timing claim; actual runtime integration required.'});
 }
}
await writeFile(resolve(directory,'vad-fusion-analysis.json'),JSON.stringify(output,null,2));
for(const row of output)console.log(JSON.stringify(row));
