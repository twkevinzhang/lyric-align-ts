import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { alignSegments } from "../app/lib/segment-alignment.ts";
import { parseLyrics } from "../app/lib/lyrics.ts";

const [python, upstreamSrc, segmentsFile, lyricsFile, pairingArg = "auto"] =
  process.argv.slice(2);
const pairing = pairingArg === "auto" ? "auto" : Number(pairingArg);
if (!lyricsFile)
  throw new Error(
    "Usage: node scripts/compare-upstream.ts PYTHON UPSTREAM_SRC segments.json lyrics.txt",
  );
const oracle = spawnSync(
  python,
  [
    fileURLToPath(new URL("./compare-upstream.py", import.meta.url)),
    upstreamSrc,
    segmentsFile,
    lyricsFile,
    pairingArg,
  ],
  {
    encoding: "utf8",
    env: { ...process.env, PYTHONUTF8: "1" },
    maxBuffer: 20 * 1024 * 1024,
  },
);
if (oracle.status !== 0) throw new Error(oracle.stderr || String(oracle.error));
const expected = JSON.parse(oracle.stdout);
const actual = alignSegments(
  JSON.parse(readFileSync(segmentsFile, "utf8")),
  parseLyrics(readFileSync(lyricsFile, "utf8")),
  pairing,
);
assert.deepEqual(
  actual.map((row) => ({
    line: row.line,
    start: row.start,
    end: row.end,
    score: row.score,
    matched: row.matched,
  })),
  expected,
);
console.log(
  JSON.stringify({
    lines: actual.length,
    matched: actual.filter((r) => r.matched).length,
    differences: 0,
    pairing,
    window: 4,
  }),
);
