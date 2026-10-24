import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

test('analysis keeps an erroneous start even when its end is missing',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'boundary-report-'));
 try{
  const reference=join(directory,'reference.srt');
  await writeFile(reference,'1\n00:00:01,000 --> 00:00:02,000\na\n\n2\n00:00:04,000 --> 00:00:05,000\nb\n');
  await writeFile(join(directory,'summary.json'),JSON.stringify({manifest:{config:{songs:[{id:'fixture',reference}]}},results:[{
   variant:'fixture',song:'fixture',trial:1,audioSeconds:10,metrics:{operationSeconds:1},
   acceptance:{excluded:[],meanAbs:1},endMeanAbs:null,
   score:{rows:[{line:1,usable:true,error:2,start:3,end:null},{line:2,usable:true,error:0,start:4,end:5}]}
  }]}));
  execFileSync(process.execPath,[resolve(import.meta.dirname,'../../scripts/analyze-boundaries.mjs'),directory]);
  const [result]=JSON.parse(await readFile(join(directory,'boundary-analysis.json'),'utf8'));
  assert.equal(result.startAll.mae,1);
  assert.equal(result.startAll.count,2);
  assert.equal(result.startAll.invalid,0);
  assert.equal(result.endAll.mae,null);
  assert.equal(result.endAll.invalid,1);
  assert.equal(result.pass,false);
 }finally{await rm(directory,{recursive:true,force:true});}
});
