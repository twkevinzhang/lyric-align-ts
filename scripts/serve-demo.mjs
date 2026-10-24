import {resolve} from 'node:path';
import {staticServer} from './static-server.mjs';
const server=await staticServer({root:resolve(import.meta.dirname,'..'),port:Number(process.env.PORT??5175)});
console.log(`${server.url}/examples/browser/ (static files only; Ctrl+C to stop)`);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.close();process.exit(0);});
