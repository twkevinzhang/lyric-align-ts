import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,rm,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root,prepareAssets} from './assets.mjs';
const output=resolve(root,'dist');
if(!output.startsWith(root+'/')&&!output.startsWith(root+'\\'))throw Error('Build output must stay inside project');
await rm(output,{recursive:true,force:true});
await mkdir(resolve(root,'dist'),{recursive:true});
await prepareAssets();
const common={bundle:true,platform:'browser',target:['es2022'],sourcemap:true,legalComments:'eof',metafile:true};
const main=await build({...common,entryPoints:[resolve(root,'src/index.ts')],outfile:resolve(root,'dist/index.js'),format:'esm'});
await build({...common,entryPoints:[resolve(root,'src/binding.ts')],outfile:resolve(root,'dist/binding.js'),format:'esm'});
const worker=await build({...common,entryPoints:[resolve(root,'src/worker.ts')],outfile:resolve(root,'dist/worker.js'),format:'iife'});
execFileSync(process.execPath,[resolve(root,'node_modules/typescript/bin/tsc'),'--emitDeclarationOnly'],{cwd:root,stdio:'inherit'});
// Declaration imports must resolve in a tarball containing .d.ts, not source .ts.
async function fixTypes(dir){for(const file of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,file.name);if(file.isDirectory()){if(file.name!=='assets')await fixTypes(path);}else if(file.name.endsWith('.d.ts')){const value=await readFile(path,'utf8');await writeFile(path,value.replace(/(from\s+['"][^'"]+)\.ts(['"])/g,'$1.js$2'));}}}
await fixTypes(resolve(root,'dist'));
await mkdir(resolve(root,'.local/package'),{recursive:true});
await writeFile(resolve(root,'.local/package/metafile.json'),JSON.stringify({main,worker},null,2));
console.log('Built browser ESM, classic Worker, declarations and static WASM/tokenizer assets.');
