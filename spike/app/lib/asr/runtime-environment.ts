type RuntimeAssets = { mjs: string; wasm: string };
type RuntimeEnvironment = {
  allowLocalModels: boolean;
  useWasmCache: boolean;
  backends: {
    onnx: {
      wasm?: {
        numThreads?: number;
        proxy?: boolean;
        wasmPaths?: string | { mjs?: string | URL; wasm?: string | URL };
      };
    };
  };
};
/** MV3 cannot import the JavaScript Blob produced by Transformers' WASM cache.
 * Load the fixed, packaged factory directly; model caching remains unchanged. */
export function configureRuntime(
  environment: RuntimeEnvironment,
  assets: RuntimeAssets & { standard?: RuntimeAssets },
) {
  const wasm = environment.backends.onnx.wasm;
  if (!wasm) throw Error("ONNX WASM runtime is unavailable");
  // Transformers already chooses standard WASM for Safari <26 without WebGPU.
  // Preserve that choice without duplicating its browser detection policy.
  const factory =
    typeof wasm.wasmPaths === "object" ? String(wasm.wasmPaths.mjs ?? "") : "";
  const standard = /\/ort-wasm-simd-threaded(?:-[^/]*)?\.mjs(?:[?#].*)?$/.test(
    factory,
  );
  environment.allowLocalModels = false;
  environment.useWasmCache = false;
  wasm.numThreads = 1;
  wasm.proxy = false;
  wasm.wasmPaths =
    standard && assets.standard
      ? { ...assets.standard }
      : { mjs: assets.mjs, wasm: assets.wasm };
}
