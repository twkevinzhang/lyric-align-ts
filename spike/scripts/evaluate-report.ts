import { readFileSync } from "node:fs";
import { completeRun, type Run } from "../app/lib/workflow.ts";
import {
  canScoreRun,
  scoreLineStarts,
  type HumanReference,
} from "../app/lib/reference.ts";
import { MODEL, SETTINGS } from "../app/lib/protocol.ts";

const [reportPath, referencePath] = process.argv.slice(2);
if (!reportPath || !referencePath)
  throw new Error(
    "Usage: node scripts/evaluate-report.ts <report.json> <reference-map.json>",
  );
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const reference: HumanReference = JSON.parse(
  readFileSync(referencePath, "utf8"),
);
if (report.schema !== 4 || !Array.isArray(report.runs) || !report.runs.length)
  throw new Error("Expected a schema 4 report with runs");
if (
  report.profile?.model?.id !== MODEL.id ||
  report.profile?.model?.revision !== MODEL.revision ||
  Object.entries(SETTINGS).some(
    ([key, value]) => report.profile?.settings?.[key] !== value,
  )
)
  throw new Error("Report does not use the fixed small.en q4 WebGPU profile");
const incomplete = (run: Run) =>
  Boolean(run.error || !run.output || run.elapsedMs == null);
const excluded = report.runs.filter(incomplete).map((run: Run) => ({
  startedAt: run.startedAt,
  reason: run.error ?? "Incomplete run",
}));
const complete = report.runs.filter((run: Run) => !incomplete(run));
if (!complete.length) throw new Error("No complete runs to score");
const results = complete.map((run: Run) => {
  if (!canScoreRun(report.audio?.sha256, run, reference))
    throw new Error("Full-song audio identity or lyric reference differs");
  const recomputed = completeRun(run, run.output, run.elapsedMs!);
  return {
    startedAt: run.startedAt,
    elapsedMs: run.elapsedMs,
    wordErrors: recomputed.wordErrors,
    segmentRecords: recomputed.analysis!.segments.length,
    anomalies: recomputed.analysis!.anomalies.length,
    lineTiming: scoreLineStarts(recomputed.lines!, reference.references),
  };
});
console.log(
  JSON.stringify(
    {
      audioSha256: reference.audioSha256,
      results,
      excluded,
      limits:
        "No lyrics supplied to ASR. Native segment boundaries; no corrections. Human line starts do not validate line ends. Error statistics exclude unmatched lines; success rates include all eligible lines.",
    },
    null,
    2,
  ),
);
