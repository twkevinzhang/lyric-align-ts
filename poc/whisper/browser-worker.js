/* The application worker owns the module and serializes inference calls. */
self.onmessage = async ({ data: { runId, trace = false } }) => {
  let module;
  const allocations = new Set();
  const progress = text => self.postMessage({ progress: text });
  try {
    const get = async path => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      return response;
    };
    const lock = await (await get('/lock.json')).json();
    const inputs = await (await get('/inputs.json')).json();
    const instrumentation = trace ? await (await get('/instrumentation.json')).json() : undefined;
    const hash = async buffer => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), b => b.toString(16).padStart(2, '0')).join('');
    const save = async (name, body) => {
      const response = await fetch(`/result/${name}?run=${runId}`, { method: 'POST', body });
      if (!response.ok) throw new Error(`Save ${name}: HTTP ${response.status}`);
    };
    progress('Downloading and hashing model');
    let model = await (await get('/model.bin')).arrayBuffer();
    if (await hash(model) !== lock.model.sha256) throw new Error('Browser model hash mismatch');
    const mel = await (await get('/mel.f32')).arrayBuffer();
    if (await hash(mel) !== inputs.melSha256) throw new Error('Browser Mel hash mismatch');
    const lockBytes = await (await get('/lock.json')).arrayBuffer();
    if (await hash(lockBytes) !== inputs.lockSha256) throw new Error('Browser lock mismatch');
    const started = performance.now();
    importScripts('/wasm/parity.js');
    module = await createWhisperParity({
      noInitialRun: true,
      mainScriptUrlOrBlob: new URL('/wasm/parity.js', self.location.href).href,
      locateFile: name => new URL(`/wasm/${name}`, self.location.href).href,
      print: text => console.log(text), printErr: text => console.log(text),
    });
    const allocate = bytes => {
      const pointer = module._malloc(bytes);
      if (!pointer) throw new Error('WASM allocation failed');
      allocations.add(pointer); return pointer;
    };
    const free = pointer => { module._free(pointer); allocations.delete(pointer); };
    const f32 = (pointer, count) => new Float32Array(module.HEAPU8.buffer, pointer, count);
    const i32 = (pointer, count) => new Int32Array(module.HEAPU8.buffer, pointer, count);
    module.FS.writeFile('/model.bin', new Uint8Array(model));
    model = null;
    if (module.ccall('poc_open', 'number', ['string'], ['/model.bin'])) throw new Error('Model initialization failed');
    module.FS.unlink('/model.bin');
    if (trace) {
      module.FS.mkdir('/trace');
      if (module.ccall('poc_trace_begin', 'number', ['string'], ['/trace'])) throw new Error('Trace initialization failed');
    }
    progress('Encoding identical Mel on WASM CPU');
    const melPointer = allocate(mel.byteLength);
    module.HEAPU8.set(new Uint8Array(mel), melPointer);
    const encodeStarted = performance.now();
    if (module._poc_encode(melPointer, 3000, 80)) throw new Error('Encoder failed');
    const encodeMs = performance.now() - encodeStarted;
    free(melPointer);
    if (trace) {
      if (module._poc_trace_end()) throw new Error('Trace capture failed');
      const manifest = module.FS.readFile('/trace/trace.json', { encoding: 'utf8' });
      for (const tensor of JSON.parse(manifest)) {
        progress(`Saving ${tensor.name}`);
        const path = `/trace/${tensor.name}.f32`;
        await save(`${tensor.name}.f32`, module.FS.readFile(path));
        module.FS.unlink(path);
      }
      await save('trace.json', manifest);
      module.FS.unlink('/trace/trace.json');
    }
    const tensors = [];
    for (const step of lock.steps) {
      progress(`Decoding ${step.name}`);
      const tokenPointer = allocate(step.tokens.length * 4);
      i32(tokenPointer, step.tokens.length).set(step.tokens);
      const decodeStarted = performance.now();
      if (module._poc_decode(tokenPointer, step.tokens.length, step.nPast)) throw new Error(`Decode ${step.name} failed`);
      const decodeMs = performance.now() - decodeStarted;
      free(tokenPointer);
      const vocab = module._poc_vocab();
      const logits = f32(module._poc_logits(), vocab).slice();
      const dimsPointer = allocate(12);
      const count = module._poc_qk_dims(dimsPointer);
      const qkDims = Array.from(i32(dimsPointer, 3));
      free(dimsPointer);
      if (count <= 0) throw new Error('Missing QK');
      const qkPointer = allocate(count * 4);
      if (module._poc_qk_copy(qkPointer, count)) throw new Error('QK copy failed');
      const qk = f32(qkPointer, count).slice();
      free(qkPointer);
      await save(`${step.name}.logits.f32`, logits.buffer);
      await save(`${step.name}.qk.f32`, qk.buffer);
      tensors.push({ ...step, logitsDims: [vocab], qkDims, decodeMs });
    }
    const elapsedMs = performance.now() - started;
    module._poc_close();
    await save('tensors.json', JSON.stringify(tensors));
    await save('run.json', JSON.stringify({ ...inputs, runId, runtime: 'browser-wasm', userAgent: navigator.userAgent,
      crossOriginIsolated: self.crossOriginIsolated, instrumentation, encodeMs, elapsedMs, wasmHeapBytes: module.HEAPU8.byteLength }));
    self.postMessage({ done: true });
  } catch (error) {
    self.postMessage({ error: error.stack || String(error) });
  } finally {
    if (module) {
      for (const pointer of allocations) module._free(pointer);
      module._poc_close();
    }
  }
};
