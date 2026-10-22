import { readFileSync } from "node:fs";
import {
  scoreLineStarts,
  referenceApplies,
  type LineReference,
} from "../app/lib/reference.ts";
import { parseLyrics } from "../app/lib/alignment.ts";

const [reportPath, referencePath] = process.argv.slice(2);
if (!reportPath || !referencePath)
  throw new Error(
    "Usage: node scripts/evaluate-reference.ts <report.json> <reference-map.json>",
  );
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const reference = JSON.parse(readFileSync(referencePath, "utf8")) as {
  audioSha256: string;
  lyrics: string[];
  references: LineReference[];
};
const reportLines = parseLyrics(String(report.alignment?.lyrics ?? ""));
if (
  !referenceApplies(
    report.audio?.sha256,
    report.runs?.at(-1)?.audio?.sha256,
    reference.audioSha256,
    reportLines,
    reference.lyrics,
  )
)
  throw new Error("Audio hash or lyric lines differ from the reference map");
if (report.runs?.at(-1)?.secondsTested < report.audio.duration - 0.05)
  throw new Error("Reference scoring requires a full-song run");
const baseline = scoreLineStarts(report.alignment.lines, reference.references);
const native = report.nativeAlignment?.lines
  ? scoreLineStarts(report.nativeAlignment.lines, reference.references)
  : null;
console.log(
  JSON.stringify(
    { audioSha256: reference.audioSha256, baseline, native },
    null,
    2,
  ),
);
