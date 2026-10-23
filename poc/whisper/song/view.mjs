import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const profile=process.env.SONG_OUTPUT||'song';
if(!/^[a-z][a-z0-9-]*$/.test(profile))throw new Error('Invalid SONG_OUTPUT');
const directory=resolve(import.meta.dirname,'../../../.local/whisper-poc',profile);
const routes=new Map([['/',['comparison.html','text/html; charset=utf-8']],['/comparison.json',['comparison.json','application/json']],['/performance.json',['performance.json','application/json']],['/native.srt',['native.srt','text/plain; charset=utf-8']],['/wasm.srt',['wasm.srt','text/plain; charset=utf-8']]]);
createServer(async(req,res)=>{
  if(req.headers.host!=='127.0.0.1:5174'){res.writeHead(403).end();return;}
  const route=routes.get(new URL(req.url,'http://127.0.0.1:5174').pathname);
  if(!route||!['GET','HEAD'].includes(req.method)){res.writeHead(404).end();return;}
  try{res.setHeader('Content-Type',route[1]);res.end(req.method==='HEAD'?undefined:await readFile(resolve(directory,route[0])));}catch{res.writeHead(404).end();}
}).listen(5174,'127.0.0.1',()=>console.log('Report preview http://127.0.0.1:5174/'));
