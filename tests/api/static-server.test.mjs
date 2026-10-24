import{test}from'node:test';import assert from'node:assert/strict';import{resolve}from'node:path';import{request}from'node:http';
import{staticServer}from'../../scripts/static-server.mjs';
test('development server only serves the demo/package assets and explicit fixtures',async()=>{
 const s=await staticServer({root:resolve(import.meta.dirname,'../..')});
 try{
  const page=await fetch(s.url+'/examples/browser/');assert.equal(page.status,200);assert.equal(page.headers.get('Cross-Origin-Opener-Policy'),'same-origin');
  for(const file of ['/.git/config','/.local/package/package-check.json','/package.json','/src/index.ts'])assert.equal((await fetch(s.url+file)).status,404);
  const foreign=await new Promise((done,reject)=>{const r=request(s.url,{headers:{Host:'attacker.invalid'}},res=>{res.resume();res.on('end',()=>done(res.statusCode));});r.on('error',reject);r.end();});assert.equal(foreign,403);
 }finally{await s.close();}
});
