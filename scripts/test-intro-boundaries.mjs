// Verify real browser results: only the first token/containing word may move.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const [baselineDirectory,candidateDirectory,baselineVariant='baseline-a',candidateVariant='production']=process.argv.slice(2);
if(!baselineDirectory||!candidateDirectory)throw Error('Pass baseline and candidate result directories, optionally variant ids');
const {config}=JSON.parse(await readFile(resolve(candidateDirectory,'manifest.json'),'utf8'));
let checked=0;
for(const song of config.songs){
 const baseline=JSON.parse(await readFile(resolve(baselineDirectory,`${baselineVariant}-${song.id}-1.json`),'utf8'));
 const files=(await readdir(candidateDirectory)).filter(f=>f.startsWith(`${candidateVariant}-${song.id}-`)&&/\d+\.json$/.test(f));
 assert.ok(files.length,`No candidate results for ${song.id}`);
 for(const file of files){
  const candidate=JSON.parse(await readFile(resolve(candidateDirectory,file),'utf8'));
  assert.ok(candidate.words[0].startTime>=baseline.words[0].startTime,'Intro moved backwards');
  assert.ok(candidate.words[0].startTime<candidate.words[0].endTime,'Intro erased first word');
  const restored=structuredClone(candidate.words);
  function restoreFirstStart(actual,expected){
   actual.startTime=expected.startTime;
   if(actual.timeline?.length)restoreFirstStart(actual.timeline[0],expected.timeline[0]);
  }
  restoreFirstStart(restored[0],baseline.words[0]);
  assert.deepEqual(restored,baseline.words,`${file}: non-intro timing/text changed`);
  assert.equal(candidate.audioSeconds,baseline.audioSeconds);
  checked++;
 }
}
console.log(`${checked} real-browser results preserve every end, non-intro token and text (including UTF-8 fragments).`);
