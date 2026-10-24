import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const directory=resolve(process.argv[2]),left=process.argv[3],right=process.argv[4];
const {results,manifest}=JSON.parse(await readFile(resolve(directory,'summary.json'),'utf8'));
const output=[];
for(const song of manifest.config.songs){
 const a=results.find(r=>r.song===song.id&&r.variant===left)?.metrics?.profile?.parts;
 const b=results.find(r=>r.song===song.id&&r.variant===right)?.metrics?.profile?.parts;
 if(!a||!b)throw Error('Both variants need per-window profiling');
 const i=a.findIndex((p,k)=>!b[k]||p.offsetSeconds!==b[k].offsetSeconds||p.kept!==b[k].kept);
 output.push({song:song.id,firstConsumptionDifference:i<0?null:i,
  before:i>0?{left:a[i-1],right:b[i-1]}:null,
  difference:i>=0?{left:a[i],right:b[i]}:null,
  after:i>=0?{left:a[i+1],right:b[i+1]}:null,
  note:'Window consumption comparison only; not proof that the token difference alone causes subsequent drift.'});
}
await writeFile(resolve(directory,'prefix-divergence.json'),JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
