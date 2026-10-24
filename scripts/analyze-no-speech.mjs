// Offline evaluation only. Reference times never enter the inference probe.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseSrt} from '../src/subtitles.ts';
const directory=resolve(process.argv[2]);
const {results,manifest}=JSON.parse(await readFile(resolve(directory,'summary.json'),'utf8'));
const rows=[];
for(const result of results){
 const song=manifest.config.songs.find(s=>s.id===result.song);
 const reference=parseSrt(await readFile(song.reference,'utf8'));
 const variant=manifest.config.variants.find(v=>v.id===result.variant);
 const duration=variant.engine.audioContext*.02*variant.engine.timeScale;
 for(const probe of result.metrics.profile.noSpeech){
  const start=probe.offsetSeconds,end=Math.min(result.audioSeconds,start+duration);
  const spans=reference.map(r=>[Math.max(start,r.start),Math.min(end,r.end)]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
  let covered=0,last=start;
  for(const [a,b] of spans){covered+=Math.max(0,b-Math.max(a,last));last=Math.max(last,b);}
  rows.push({song:result.song,...probe,referenceCoverage:covered/(end-start)});
 }
}
await writeFile(resolve(directory,'no-speech-analysis.json'),JSON.stringify(rows,null,2));
console.log(JSON.stringify({windows:rows.length,instrumental:rows.filter(r=>r.referenceCoverage===0),vocalHighProbability:rows.filter(r=>r.referenceCoverage>.7&&r.probability>.6),note:'Reference coverage is diagnostic, not an inference gate.'},null,2));
