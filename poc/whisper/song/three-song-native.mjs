import {spawn} from 'node:child_process';
import {songs,mediaRoot} from './three-song-config.mjs';
import {resolve} from 'node:path';
for(const song of songs)for(const kind of ['pcm','original']){
 if(process.argv.includes('--skip-grace-pcm')&&song.id==='grace'&&kind==='pcm')continue;
 const env={...process.env,SONG_THREADS:'8',SONG_POOL_SIZE:'12',SONG_DIR:resolve(mediaRoot,song.directory),SONG_LANGUAGE:song.language,SONG_LYRICS:song.lyrics,SONG_AUDIO:kind==='pcm'?'256k-16kHz-單聲道.wav':song.original,SONG_OUTPUT:`eval-three-${song.id}-${kind}`};
 console.log(`BENCHMARK START ${song.id} ${kind}`);
 const child=spawn(process.execPath,[resolve(import.meta.dirname,'native-run.mjs')],{env,stdio:'inherit',windowsHide:true});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
 console.log(`BENCHMARK EXIT ${song.id} ${kind}: ${code}`);
}
