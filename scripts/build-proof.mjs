import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const hash=value=>createHash('sha256').update(value).digest('hex');
async function files(root,dir){
 const result=[];
 for(const entry of (await readdir(resolve(root,dir),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
  const name=dir+'/'+entry.name;if(entry.isDirectory())result.push(...await files(root,name));else result.push(name);
 }
 return result;
}
async function source(root){
 const paths=[...await files(root,'src'),...await files(root,'vendor'),'package.json','scripts/build.mjs','scripts/assets.mjs','scripts/build-proof.mjs'];
 const digest=createHash('sha256');
 for(const path of paths)digest.update(path+'\0').update((await readFile(resolve(root,path),'utf8')).replaceAll('\r\n','\n')).update('\0');
 return digest.digest('hex');
}
async function output(root){
 const result={};
 for(const path of await files(root,'dist'))if(path!=='dist/build-proof.json')result[path]=hash(await readFile(resolve(root,path)));
 return result;
}
export async function recordDistribution(root){
 await writeFile(resolve(root,'dist/build-proof.json'),JSON.stringify({source:await source(root),files:await output(root)},null,2));
}
export async function verifyDistribution(root){
 let proof;try{proof=JSON.parse(await readFile(resolve(root,'dist/build-proof.json'),'utf8'));}catch{throw Error('Distribution proof missing; run pnpm run build');}
 if(proof.source!==await source(root))throw Error('Distribution source does not match this commit; run pnpm run build');
 const actual=await output(root);
 for(const name of new Set([...Object.keys(actual),...Object.keys(proof.files??{})]))if(proof.files?.[name]!==actual[name])throw Error(`Distribution ${name} changed; run pnpm run build`);
}
