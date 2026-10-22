import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  worker: { format: "es" },
  build: {
    outDir: "dist/library",
    lib: {
      entry: "app/lib/binding/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    sourcemap: true,
  },
});
