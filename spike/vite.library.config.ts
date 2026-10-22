import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  resolve: {
    conditions: [
      "onnxruntime-web-use-extern-wasm",
      "module",
      "browser",
      "development|production",
    ],
  },
  worker: { format: "es" },
  build: {
    outDir: "dist/library",
    lib: {
      entry: "app/lib/binding/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    sourcemap: false,
  },
});
