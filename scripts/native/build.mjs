import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {root,lock} from './paths.mjs';
import {rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {sourceFingerprint,recordBuild} from './build-proof.mjs';
const windowsDocker='C:/Program Files/Docker/Docker/resources/bin/docker.exe';
const docker=process.env.DOCKER_BIN || (process.platform==='win32' && existsSync(windowsDocker) ? windowsDocker : 'docker');
const directory=resolve(root,'.local/native/build'),expected=await sourceFingerprint(root);
await rm(resolve(directory,'build-proof.json'),{force:true});
// Pinned CMake predates --fresh. Reset only its cache file so experimental
// -D options from another commit cannot leak into this build.
await rm(resolve(directory,'CMakeCache.txt'),{force:true});
execFileSync(docker,['run','--rm','-v',`${root}:/workspace`,'-w','/workspace',lock.buildImage,'bash','scripts/native/build.sh'],{stdio:'inherit'});
await recordBuild(root,directory,expected);
