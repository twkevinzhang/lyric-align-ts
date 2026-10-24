import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {prepareSource} from './paths.mjs';
await prepareSource();
for(const file of ['compact-source.mjs','timescale-source.mjs'])execFileSync(process.execPath,[resolve(import.meta.dirname,file)],{stdio:'inherit'});
