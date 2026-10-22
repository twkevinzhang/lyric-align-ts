import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { binding } from "../app/lib/binding/index.ts";

const manifest = JSON.parse(readFileSync("library.package.json", "utf8"));
if (manifest.version !== binding.capabilities.libraryVersion)
  throw Error("Package/library version mismatch");
writeFileSync(
  "dist/library/package.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
writeFileSync(
  "dist/library/index.d.ts",
  'export * from "./types/binding/index.js";\n',
);
copyFileSync("../LICENSE", "dist/library/LICENSE");
copyFileSync("library.README.md", "dist/library/README.md");
copyFileSync("THIRD_PARTY_NOTICES.md", "dist/library/THIRD_PARTY_NOTICES.md");
mkdirSync("dist/library/licenses", { recursive: true });
for (const name of ["upstream.LICENSE", "asr-upstream.LICENSE"])
  copyFileSync(name, `dist/library/licenses/${name}`);
for (const [name, path] of Object.entries({
  "transformers.LICENSE": "@huggingface/transformers/LICENSE",
  "tokenizers.LICENSE": "@huggingface/tokenizers/LICENSE",
  "jinja.LICENSE": "@huggingface/jinja/LICENSE",
  "pako.LICENSE": "pako/LICENSE",
}))
  copyFileSync(`node_modules/${path}`, `dist/library/licenses/${name}`);
for (const name of [
  "onnxruntime.LICENSE",
  "onnxruntime.NOTICE",
  "pako-zlib.LICENSE",
])
  copyFileSync(`licenses/${name}`, `dist/library/licenses/${name}`);
