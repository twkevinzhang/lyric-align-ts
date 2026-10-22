import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { createReadStream, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

function localAudio(): Plugin {
  return {
    name: "local-test-audio",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__local/reference.json", (req, res) => {
        const path = fileURLToPath(
          new URL("../.local/results/reference-map.json", import.meta.url),
        );
        if (!existsSync(path)) {
          res.statusCode = 404;
          res.end("No local reference map");
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        createReadStream(path)
          .on("error", () => res.destroy())
          .pipe(res);
      });
      server.middlewares.use("/__local/amazing-grace.txt", (req, res) => {
        const path = fileURLToPath(
          new URL(
            "../.local/test-media/amazing_grace/amazing_grace.txt",
            import.meta.url,
          ),
        );
        if (!existsSync(path)) {
          res.statusCode = 404;
          res.end("Local lyrics are absent.");
          return;
        }
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        createReadStream(path)
          .on("error", () => res.destroy())
          .pipe(res);
      });
      server.middlewares.use("/__local/amazing-grace.m4a", (req, res) => {
        const path = fileURLToPath(
          new URL(
            "../.local/test-media/amazing_grace/amazing_grace.m4a",
            import.meta.url,
          ),
        );
        if (!existsSync(path)) {
          res.statusCode = 404;
          res.end("Local audio is absent. Select your own file.");
          return;
        }
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.statusCode = 405;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "audio/mp4");
        res.setHeader("Cache-Control", "no-store");
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        createReadStream(path)
          .on("error", () => res.destroy())
          .pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths(), localAudio()],
  worker: { format: "es" },
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
  server: {
    hmr: false,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
