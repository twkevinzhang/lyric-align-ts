import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const digest=value=>createHash('sha256').update(value).digest('hex');
export async function sourceFingerprint(root){
 const hash=createHash('sha256');
 async function visit(relative){
  for(const entry of (await readdir(resolve(root,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
   const name=relative+'/'+entry.name;
   if(entry.isDirectory())await visit(name);
   else hash.update(name+'\0').update((await readFile(resolve(root,name),'utf8')).replaceAll('\r\n','\n')).update('\0');
  }
 }
 await visit('native');await visit('scripts/native');return hash.digest('hex');
}
export async function recordBuild(root,directory,expected){
 const source=await sourceFingerprint(root);
 if(expected&&source!==expected)throw Error('Native source changed during build; run build:native again');
 const assets={};for(const name of ['parity.js','parity.wasm'])assets[name]=digest(await readFile(resolve(directory,name)));
 await writeFile(resolve(directory,'build-proof.json'),JSON.stringify({source,assets},null,2));
}
export async function verifyBuild(root,directory){
 let proof;
 try{proof=JSON.parse(await readFile(resolve(directory,'build-proof.json'),'utf8'));}
 catch{throw Error('Native build proof is missing. Run pnpm run build:native before build.');}
 if(proof.source!==await sourceFingerprint(root))throw Error('Native source does not match this commit. Run pnpm run build:native before build.');
 for(const name of ['parity.js','parity.wasm'])if(proof.assets?.[name]!==digest(await readFile(resolve(directory,name))))throw Error(`Native ${name} changed after build. Run pnpm run build:native.`);
 return proof;
}
