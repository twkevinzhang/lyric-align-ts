import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.wasm':'application/wasm','.json':'application/json','.tiktoken':'text/plain','.wav':'audio/wav'};
/** Development/test static files only. No inference, tokenizer or POST RPC here. */
export async function staticServer({root,port=0,files={}}){
 root=resolve(root);
 const server=createServer(async(req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
  try{
   const port=server.address()?.port;
   if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)){res.writeHead(403).end();return;}
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(!files[pathname]&&pathname!=='/'&&pathname!=='/index.html'&&!['/dist/','/examples/','/node_modules/lyric-align-ts/'].some(prefix=>pathname.startsWith(prefix))){res.writeHead(404).end();return;}
   let path=files[pathname]??resolve(root,'.'+pathname);
   if(!files[pathname]&&path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}
   if((await stat(path)).isDirectory())path=resolve(path,'index.html');
   const bytes=await readFile(path);res.setHeader('Content-Type',mime[extname(path)]??'application/octet-stream');res.setHeader('Content-Length',bytes.length);res.writeHead(200);res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(404).end('Not found');}
 });
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
 const url=`http://127.0.0.1:${server.address().port}`;
 return{url,close:()=>new Promise((done,reject)=>{server.close(e=>e?reject(e):done());server.closeAllConnections();})};
}
