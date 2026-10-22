import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const npm = process.env.npm_execpath;
assert.ok(npm, "Run with npm run verify:library-package");
const packed = JSON.parse(
  execFileSync(
    process.execPath,
    [npm, "pack", "--dry-run", "--json", "./dist/library"],
    { encoding: "utf8" },
  ),
);
const report = Array.isArray(packed)
  ? packed[0]
  : packed.files
    ? packed
    : Object.values(packed)[0];
const manifest = JSON.parse(readFileSync("dist/library/package.json", "utf8"));
const source = JSON.parse(readFileSync("library.package.json", "utf8"));
assert.deepEqual(
  manifest,
  source,
  "Build output metadata must match release source",
);
assert.equal(manifest.private, undefined);
assert.equal(manifest.publishConfig.access, "public");
assert.equal(manifest.license, "MIT");
assert.equal(report.name, manifest.name);
assert.equal(report.version, manifest.version);
const paths: string[] = report.files.map((file: { path: string }) => file.path);
for (const required of [
  "index.js",
  "index.d.ts",
  "package.json",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "types/binding/index.d.ts",
  "types/binding/contract.d.ts",
  "licenses/transformers.LICENSE",
  "licenses/onnxruntime.NOTICE",
  "licenses/pako-zlib.LICENSE",
])
  assert.ok(paths.includes(required), `Missing ${required}`);
assert.equal(
  paths.filter((path) => /^assets\/worker-[^/]+\.js$/.test(path)).length,
  1,
);
for (const path of paths)
  assert.match(
    path,
    /^(?:index\.(?:js|d\.ts)|package\.json|README\.md|LICENSE|THIRD_PARTY_NOTICES\.md|assets\/[^/]+\.(?:js|mjs|wasm)|types\/.+\.d\.ts|licenses\/[^/]+)$/,
    "Unexpected package file: " + path,
  );
for (const extension of ["mjs", "wasm"])
  for (const variant of ["\\.asyncify", ""])
    assert.equal(
      paths.filter((path) =>
        new RegExp(
          `^assets/ort-wasm-simd-threaded${variant}-[^/]+\\.${extension}$`,
        ).test(path),
      ).length,
      1,
      `Missing static runtime ${extension}`,
    );
console.log(
  JSON.stringify(
    {
      name: report.name,
      version: report.version,
      files: paths.length,
      packedBytes: report.size,
      unpackedBytes: report.unpackedSize,
      status: "pass",
    },
    null,
    2,
  ),
);
