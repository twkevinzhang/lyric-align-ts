import test from "node:test";
import assert from "node:assert/strict";
import { configureRuntime } from "./runtime-environment.ts";
test("uses packaged runtime URLs without JS Blob cache or proxy Workers", () => {
  const environment = {
    allowLocalModels: true,
    useWasmCache: true,
    backends: {
      onnx: {
        wasm: { numThreads: 4, proxy: true, wasmPaths: "https://cdn.example/" },
      },
    },
  };
  const assets = {
    mjs: "chrome-extension://test/assets/runtime.mjs",
    wasm: "chrome-extension://test/assets/runtime.wasm",
  };
  configureRuntime(environment, assets);
  assert.equal(environment.useWasmCache, false);
  assert.equal(environment.allowLocalModels, false);
  assert.equal(environment.backends.onnx.wasm.numThreads, 1);
  assert.equal(environment.backends.onnx.wasm.proxy, false);
  assert.deepEqual(environment.backends.onnx.wasm.wasmPaths, assets);
});
test("preserves upstream non-asyncify choice for older Safari WASM", () => {
  const environment = {
    allowLocalModels: true,
    useWasmCache: true,
    backends: {
      onnx: {
        wasm: {
          wasmPaths: {
            mjs: "https://cdn.example/ort-wasm-simd-threaded.mjs",
            wasm: "https://cdn.example/ort-wasm-simd-threaded.wasm",
          },
        },
      },
    },
  };
  const assets = {
    mjs: "chrome-extension://test/ort-wasm-simd-threaded.asyncify-hash.mjs",
    wasm: "chrome-extension://test/asyncify.wasm",
    standard: {
      mjs: "chrome-extension://test/ort-wasm-simd-threaded-hash.mjs",
      wasm: "chrome-extension://test/standard.wasm",
    },
  };
  configureRuntime(environment, assets);
  assert.deepEqual(environment.backends.onnx.wasm.wasmPaths, assets.standard);
  configureRuntime(environment, assets);
  assert.deepEqual(environment.backends.onnx.wasm.wasmPaths, assets.standard);
});
