import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {root,lock} from './paths.mjs';
const windowsDocker='C:/Program Files/Docker/Docker/resources/bin/docker.exe';
const docker=process.env.DOCKER_BIN || (process.platform==='win32' && existsSync(windowsDocker) ? windowsDocker : 'docker');
execFileSync(docker,['run','--rm','-v',`${root}:/workspace`,'-w','/workspace',lock.buildImage,'bash','scripts/native/build.sh'],{stdio:'inherit'});
