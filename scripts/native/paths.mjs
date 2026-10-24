import {execFileSync} from 'node:child_process';
import {readFile, mkdir, access} from 'node:fs/promises';
import {resolve} from 'node:path';
export const root=resolve(import.meta.dirname,'../..');
export const local=resolve(root,'.local/native');
export const lock=JSON.parse(await readFile(resolve(root,'native/lock.json'),'utf8'));
export async function ensureVariant(path){
  try {await access(path);} catch {execFileSync('git',['clone','--no-hardlinks',resolve(local,'source'),path],{stdio:'inherit'});}
  const commit=execFileSync('git',['-C',path,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if(commit!==lock.commit)throw Error(`Native source commit mismatch: ${commit}`);
}
export async function prepareSource(){
  await mkdir(local,{recursive:true});
  const source=resolve(local,'source');
  try {await access(source);} catch {
    execFileSync('git',['clone','--no-checkout',lock.fork,source],{stdio:'inherit'});
    execFileSync('git',['-C',source,'checkout','--detach',lock.commit],{stdio:'inherit'});
  }
  await ensureVariant(source);
}
