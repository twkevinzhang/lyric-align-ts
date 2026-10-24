import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
export const root=resolve(import.meta.dirname,'..');
const hash=b=>createHash('sha256').update(b).digest('hex');
const ranksUrl='https://raw.githubusercontent.com/openai/whisper/839639a223b92ad61851baae9ad8a695ccb41ce5/whisper/assets/multilingual.tiktoken';
export async function prepareAssets(){
 const target=resolve(root,'dist/assets'),cache=resolve(root,'.local/assets');await mkdir(target,{recursive:true});await mkdir(cache,{recursive:true});
 const native=resolve(root,process.env.NATIVE_BUILD_DIR??'.local/native/build');
 for(const file of ['parity.js','parity.wasm']){
  try{await copyFile(join(native,file),join(target,file));}catch(e){throw Error(`Missing native build ${file}. Run npm run build:native first, or set NATIVE_BUILD_DIR to an existing verified build.`,{cause:e});}
 }
 const ranksPath=join(cache,'multilingual.tiktoken');let ranks;
 try{ranks=await readFile(ranksPath);}catch(e){if(e.code!=='ENOENT')throw e;const response=await fetch(ranksUrl);if(!response.ok)throw Error(`Tokenizer download HTTP ${response.status}`);const original=Buffer.from(await response.arrayBuffer());if(hash(original)!=='b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126')throw Error('Tokenizer source integrity mismatch');
  // Echogarden maps this unused final empty token through the metadata table.
  const suffix=Buffer.from('= 50256\n');if(!original.subarray(-suffix.length).equals(suffix))throw Error('Unexpected tokenizer final row');ranks=original.subarray(0,-suffix.length);await writeFile(ranksPath,ranks);
 }
 if(hash(ranks)!=='316413f0a5497a8219e48697be7faac30a90c0756680c24114266233fba152af')throw Error('Tokenizer ranks integrity mismatch');
 await writeFile(join(target,'multilingual.tiktoken'),ranks);
 const require=createRequire(import.meta.url);const init=require.resolve('tiktoken/lite/init');
 await copyFile(resolve(init,'../tiktoken_bg.wasm'),join(target,'tiktoken_bg.wasm'));
 const manifest={tokenizer:{source:ranksUrl,sha256:hash(ranks)},assets:{}};
 for(const file of ['parity.js','parity.wasm','multilingual.tiktoken','tiktoken_bg.wasm'])manifest.assets[file]=hash(await readFile(join(target,file)));
 await writeFile(join(target,'manifest.json'),JSON.stringify(manifest,null,2));
}
