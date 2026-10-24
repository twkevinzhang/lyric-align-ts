// Classic Worker entry: bundled as IIFE so Emscripten importScripts remains available.
import { BrowserEngine } from './engine/engine.mjs';
// Replaced only by the experimental benchmark bundler; absent in release builds.
declare const __ALIGN_EXPERIMENT__: Record<string, unknown>;
const engineConfig = typeof __ALIGN_EXPERIMENT__ === 'undefined' ? {} : __ALIGN_EXPERIMENT__;
const scope = self as unknown as DedicatedWorkerGlobalScope;
let engine: BrowserEngine | undefined;
let busy = false;
scope.onmessage = async ({ data }) => {
  const { id, type } = data;
  const fail = (error: unknown) => { const e = error instanceof Error ? error : new Error(String(error)); scope.postMessage({ id, type: 'error', error: { name: e.name, message: e.message } }); };
  if (busy) { fail(new Error('Engine is busy')); return; }
  busy = true;
  try {
    let result;
    if (type === 'initialize') { if (engine) throw new Error('Engine is already initialized'); engine = new BrowserEngine(engineConfig); result = await engine.initialize(data.options, (stage: string, completed?: number, total?: number) => scope.postMessage({id,type:'progress',stage,completed,total})); }
    else if (type === 'align') { if (!engine) throw new Error('Engine is not initialized'); engine.progress = (stage: string, completed?: number, total?: number) => scope.postMessage({id,type:'progress',stage,completed,total}); result = await engine.align(data.audio,data.lyrics,data.language); }
    else if (type === 'dispose') { engine?.dispose(); engine = undefined; result = { disposed: true }; }
    else throw new Error(`Unknown worker request: ${type}`);
    scope.postMessage({ id, type: 'result', result });
  } catch (error) { if (type === 'initialize') { engine?.dispose(); engine=undefined; } fail(error); }
  finally { busy=false; }
};
