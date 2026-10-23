import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {songs,mediaRoot} from './three-song-config.mjs';
import {parseSrt} from '../../../spike/app/lib/reference.ts';
import {scoreCues} from './cue-score.mjs';
import {acceptance} from './acceptance.mjs';
const experiments=process.argv.slice(2);
assert.equal(experiments.length,3,'Exactly three fresh repetitions required');
assert.equal(new Set(experiments).size,3);
assert.ok(experiments.every(x=>/^[a-z][a-z0-9-]*$/.test(x)));
const local=resolve(import.meta.dirname,'../../../.local/whisper-poc');
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const keys=['preset','options','sourceSha256','modelSha256','modelPrecision','annotationPolicy','cachePolicy','decoderThreads','audioTimeScale','driverHashes','audioContextFrames','contextSourceSha256','decodeLocation','alignmentMode','speculativeBatch','workerTokenBudget','decoderSourceSha256','vocabSubset','workerAlignment','alignmentSourceSha256','japaneseSpacing','timestampTokens','attentionTrim','lookaheadRatio','backend','variant','buildHashes','optimization'];
let configuration;const inputs={},records=[],ids=new Set();
for(const experiment of experiments)for(const song of songs){
 const folder=resolve(local,`speed-${experiment}-${song.id}`);
 for(const marker of ['invalidated.json','aborted.json']){
  let exists=false;try{await access(resolve(folder,marker));exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}assert.equal(exists,false,`${folder}: ${marker}`);
 }
 const run=await json(resolve(folder,'wasm.json')),evaluation=await json(resolve(folder,'evaluation.json'));
 assert.equal(run.runId,evaluation.runId);assert.ok(!ids.has(run.runId));ids.add(run.runId);
 const lifecycle=await json(resolve(folder,'lifecycle.json')),stopped=await json(resolve(folder,'stopped.json'));
 assert.equal(stopped.listening,false);assert.equal(stopped.pid,lifecycle.pid);
 const started=Date.parse(lifecycle.startedAt),evaluated=Date.parse(evaluation.createdAt),ended=Date.parse(stopped.stoppedAt);
 assert.ok(Number.isFinite(started)&&Number.isFinite(evaluated)&&Number.isFinite(ended)&&started<=evaluated&&evaluated<=ended,'Results are not from this lifecycle');
 assert.equal(run.referenceUsedForInference,false);assert.equal(run.crop,false);assert.equal(run.annotationPolicy,'preserve');assert.equal(run.preset,'ten-second');
 const config=Object.fromEntries(keys.map(k=>[k,run[k]]));
 if(configuration)assert.deepEqual(config,configuration,'Configuration changed between repetitions');else configuration=config;
 for(const [file,sha]of Object.entries(run.driverHashes))assert.equal(hash(await readFile(resolve(import.meta.dirname,file))),sha,`Driver changed: ${file}`);
 for(const ext of ['js','wasm'])assert.equal(hash(await readFile(resolve(local,`build-song-${run.variant}`,`parity.${ext}`))),run.buildHashes[ext],`Build changed: ${ext}`);
 const input=Object.fromEntries(['audioSha256','lyricsSha256','pcmSha256','inferenceLyricsSha256'].map(k=>[k,run[k]]));
 if(inputs[song.id])assert.deepEqual(input,inputs[song.id]);else inputs[song.id]=input;
 assert.equal(hash(await readFile(run.audioPath)),run.audioSha256);assert.equal(hash(await readFile(run.lyricsPath)),run.lyricsSha256);
 const referencePath=resolve(mediaRoot,song.directory,song.reference),referenceBytes=await readFile(referencePath);
 const score=scoreCues(run,parseSrt(referenceBytes.toString('utf8')));
 const gate=acceptance(run.totalSeconds,score.rows.map(r=>({...r,startError:r.error})));
 assert.deepEqual(gate,evaluation.acceptance,'Stored evaluation differs from independent scoring');
 records.push({experiment,song:song.id,runId:run.runId,referenceSha256:hash(referenceBytes),...gate});
}
const result={createdAt:new Date().toISOString(),pass:records.every(r=>r.pass),configuration,configurationSha256:hash(JSON.stringify(configuration)),inputs,records};
await writeFile(resolve(local,'final-validation.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({pass:result.pass,records},null,2));
if(!result.pass)process.exitCode=1;
