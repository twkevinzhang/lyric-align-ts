import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {renderPerformanceReport} from './performance-summary.mjs';
const root=resolve(import.meta.dirname,'..');
if(!process.argv[2])throw Error('Usage: node scripts/report-three-second.mjs <benchmark result directory>');
const directory=resolve(process.argv[2]),summary=JSON.parse(await readFile(resolve(directory,'summary.json'),'utf8'));
await writeFile(resolve(root,'docs/three-second-alignment-report.md'),renderPerformanceReport(summary,relative(root,directory).replaceAll('\\','/')));
console.log('Updated current performance report from '+directory);
