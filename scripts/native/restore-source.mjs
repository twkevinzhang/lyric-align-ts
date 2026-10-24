import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {realpathSync} from 'node:fs';
/** Restore generated tracked patches; preserve untracked cache files. */
export function restoreSource(directory,expectedCommit){
 const git=(...args)=>execFileSync('git',['-c','core.autocrlf=false','-C',directory,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 if(git('rev-parse','HEAD')!==expectedCommit)throw Error('Native source commit mismatch');
 const canonical=path=>realpathSync.native(resolve(path)).replaceAll('\\','/').toLowerCase();
 if(canonical(git('rev-parse','--show-toplevel'))!==canonical(directory))throw Error('Native source directory must be the dependency repository root');
 git('restore',`--source=${expectedCommit}`,'--worktree','--','.');
}
