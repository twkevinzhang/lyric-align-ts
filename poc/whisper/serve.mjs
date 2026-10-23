import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const base = import.meta.dirname;
const local = resolve(base, '../../.local/whisper-poc');
const lock = JSON.parse(await readFile(resolve(base, 'lock.json')));
const trace = process.argv.includes('--trace');
const wasmDirectory = trace ? 'build-wasm-trace' : 'build-wasm';
const runId = randomUUID();
const output = resolve(local, 'browser', runId);
await mkdir(output, { recursive: true });
const port = 5174;
const origin = `http://127.0.0.1:${port}`;
const routes = new Map([
  ['/', [resolve(base, 'index.html'), 'text/html']],
  ['/browser-worker.js', [resolve(base, 'browser-worker.js'), 'text/javascript']],
  ['/lock.json', [resolve(base, 'lock.json'), 'application/json']],
  ['/inputs.json', [resolve(local, 'inputs.json'), 'application/json']],
  ['/instrumentation.json', [resolve(local, 'instrumentation.json'), 'application/json']],
  ['/model.bin', [resolve(local, lock.model.file), 'application/octet-stream']],
  ['/mel.f32', [resolve(local, 'mel.f32'), 'application/octet-stream']],
  ['/wasm/parity.js', [resolve(local, wasmDirectory, 'parity.js'), 'text/javascript']],
  ['/wasm/parity.wasm', [resolve(local, wasmDirectory, 'parity.wasm'), 'application/wasm']],
]);
const outputs = new Set(['tensors.json', 'run.json', ...lock.steps.flatMap(s => [`${s.name}.logits.f32`, `${s.name}.qk.f32`])]);
const server = createServer(async (request, response) => {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  response.setHeader('Cache-Control', 'no-store');
  try {
    if (request.headers.host !== `127.0.0.1:${port}`) { response.writeHead(403).end(); return; }
    const url = new URL(request.url, origin);
    if (request.method === 'GET' && url.pathname === '/session.json') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ runId, trace })); return;
    }
    const route = routes.get(url.pathname);
    if ((request.method === 'GET' || request.method === 'HEAD') && route) {
      response.setHeader('Content-Type', route[1]);
      response.end(request.method === 'HEAD' ? undefined : await readFile(route[0])); return;
    }
    const name = url.pathname.slice('/result/'.length);
    const allowed = outputs.has(name) || (trace && (name === 'trace.json' || /^trace-[a-z0-9-]+\.f32$/.test(name)));
    if (request.method === 'POST' && url.pathname.startsWith('/result/') && allowed &&
        url.searchParams.get('run') === runId && request.headers.origin === origin) {
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 32 * 1024 * 1024) throw new Error('Result exceeds limit');
        chunks.push(chunk);
      }
      await writeFile(resolve(output, name), Buffer.concat(chunks));
      if (name === 'run.json') {
        await writeFile(resolve(local, trace ? 'latest-browser-trace.txt' : 'latest-browser.txt'), runId);
        console.log(`Browser complete: ${output}`);
      }
      response.end('ok'); return;
    }
    response.writeHead(404).end('Not found');
  } catch (error) { console.error(error); response.writeHead(500).end(String(error)); }
});
server.listen(port, '127.0.0.1', () => console.log(`${origin} runId=${runId}`));
