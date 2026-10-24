// Offline feasibility only. Cached VAD is never a runtime inference input.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseSrt} from '../src/subtitles.ts';
import {boundaryAcceptance} from '../src/core/boundary-acceptance.mjs';
import {voicedIntervals} from '../src/engine/voiced-intervals.mjs';
const directory=resolve(process.argv[2]);
const {results,manifest}=JSON.parse(await readFile(resolve(directory,'summary.json'),'utf8'));
if(manifest.config.songs.some(s=>!['grace','suneo','haru'].includes(s.id)))throw Error('Only authorized development songs are allowed');
const vad=JSON.parse(await readFile(process.argv[3],'utf8')),output=[];
for(const run of results){
 if(run.error)continue;
 const signal=vad.find(v=>v.song===run.song);
 if(!signal||Math.abs(signal.audioSeconds-run.audioSeconds)>1/16000)throw Error('Missing or mismatched VAD audio');
 // Only prediction anchors are passed to the estimator. References are read
 // afterwards, exclusively for scoring the complete output.
 const anchors=run.score.rows.map(r=>({start:r.start,end:r.end}));
 for(const mode of ['both','ends']){
 const intervals=voicedIntervals(anchors,signal.probs,signal.step,run.audioSeconds,mode);
 const song=manifest.config.songs.find(s=>s.id===run.song),ref=parseSrt(await readFile(song.reference,'utf8'));
 const rows=run.score.rows.map((r,i)=>({...r,...intervals[i],startError:r.usable?intervals[i].start-ref[i].start:null,endError:r.usable?intervals[i].end-ref[i].end:null}));
 const gate=boundaryAcceptance(NaN,rows);
 output.push({variant:run.variant,song:run.song,mode,start:gate.start,end:gate.end,qualityPass:gate.qualityPass,note:'Offline quality only; cached VAD cost is excluded, so no runtime claim.'});
 }
}
await writeFile(resolve(directory,'voiced-intervals-analysis.json'),JSON.stringify(output,null,2));
for(const row of output)console.log(JSON.stringify(row));
