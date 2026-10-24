// Feasibility only: postprocess saved cue boundaries, NOT a full align() benchmark.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {prepareAudio} from '../src/audio.ts';
import {parseSrt} from '../src/subtitles.ts';
import {acousticEnvelope,snapAcousticBoundary} from '../src/engine/acoustic-envelope.mjs';
import {boundaryAcceptance} from '../src/core/boundary-acceptance.mjs';
if(process.argv.length<5)throw Error('Pass config, saved production benchmark directory, and output JSON');
const config=JSON.parse(await readFile(process.argv[2],'utf8')),output=[];
for(const song of config.songs){
 const pcm=await prepareAudio(new Blob([await readFile(song.audio)]));
 const baseline=JSON.parse(await readFile(resolve(process.argv[3],`production-${song.id}-1.json`),'utf8'));
 const reference=parseSrt(await readFile(song.reference,'utf8'));
 const start=performance.now(),envelope=acousticEnvelope(pcm),featureMs=performance.now()-start;
 const rows=baseline.score.rows.map((r,i)=>{
  let start=snapAcousticBoundary(envelope,r.start,'start'),end=snapAcousticBoundary(envelope,r.end,'end');
  if(end<start){start=r.start;end=r.end;}
  return {...r,start,end,startError:start-reference[i].start,endError:end-reference[i].end};
 });
 const gate=boundaryAcceptance(NaN,rows);
 const quality={pass:gate.qualityPass,total:gate.total,required:gate.required,start:gate.start,end:gate.end};
 const record={song:song.id,kind:'offline-cue-boundary-screen',featureMs,quality,rows};
 output.push(record);console.log(JSON.stringify({...record,rows:undefined}));
}
await writeFile(process.argv[4],JSON.stringify(output,null,2));
