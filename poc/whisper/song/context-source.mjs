import {readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
export function patchContextSource(source,frames,resolveImport){
  if(![375,750,1500].includes(frames))throw Error('Unsupported audio context');
  const anchor='const maxAudioSamplesPerPart = sampleRate * 30;';
  if(source.split(anchor).length!==2)throw Error('Ambiguous audio window anchor');
  return source.replace(anchor,`const maxAudioSamplesPerPart = sampleRate * ${frames*0.02};`)
    .replace(/^import (.+) from ['"]([^'"]+)['"];\r?$/gm,(_,binding,spec)=>`import ${binding} from ${JSON.stringify(resolveImport(spec))};`)
    .replace(/\bimport\(['"]([^'"]+)['"]\)/g,(_,spec)=>`import(${JSON.stringify(resolveImport(spec))})`);
}
export async function loadContextWhisper(echo,local,frames){
  const original=await realpath(resolve(echo,'dist/recognition/WhisperSTT.js'));
  if(frames===1500)return {...await import(pathToFileURL(original)),sourceSha256:createHash('sha256').update(await readFile(original)).digest('hex')};
  const require=createRequire(pathToFileURL(original));
  const source=patchContextSource(await readFile(original,'utf8'),frames,spec=>pathToFileURL(require.resolve(spec)).href);
  const sourceSha256=createHash('sha256').update(source).digest('hex');
  const path=resolve(local,`whisper-context-${frames}-${sourceSha256.slice(0,12)}.mjs`);
  await writeFile(path,source);
  return {...await import(pathToFileURL(path)),sourceSha256};
}
