import { copyFileSync, writeFileSync } from "node:fs";

writeFileSync(
  "dist/library/package.json",
  JSON.stringify(
    {
      name: "lyric-align-ts",
      version: "0.1.0",
      private: true,
      type: "module",
      types: "./index.d.ts",
      exports: {
        ".": { types: "./index.d.ts", import: "./index.js" },
      },
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  "dist/library/index.d.ts",
  'export * from "./types/binding/index.js";\n',
);
for (const license of ["upstream.LICENSE", "asr-upstream.LICENSE"])
  copyFileSync(license, `dist/library/${license}`);
