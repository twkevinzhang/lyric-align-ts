import { readFileSync } from "node:fs";
import {
  referenceApplies,
  scoreLineStarts,
  type LineReference,
} from "../app/lib/reference.ts";
import { parseLyrics } from "../app/lib/alignment.ts";
import { alignMonotonic } from "../app/lib/monotonic-alignment.ts";
import { inspectOutput } from "../app/lib/protocol.ts";

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .replaceAll("’", "'")
    .match(/[a-z]+(?:'[a-z]+)*/g) ?? [];
function wordErrors(reference: string, hypothesis: string) {
  const a = tokenize(reference),
    b = tokenize(hypothesis);
  if (!a.length) throw new Error("English WER requires a nonempty reference");
  type Cell = {
    cost: number;
    substitutions: number;
    deletions: number;
    insertions: number;
  };
  const d: Cell[][] = Array.from({ length: a.length + 1 }, () =>
    Array<Cell>(b.length + 1),
  );
  d[0][0] = { cost: 0, substitutions: 0, deletions: 0, insertions: 0 };
  for (let i = 0; i <= a.length; i++)
    for (let j = 0; j <= b.length; j++) {
      if (!i && !j) continue;
      const options: Cell[] = [];
      if (i && j) {
        const p = d[i - 1][j - 1],
          s = Number(a[i - 1] !== b[j - 1]);
        options.push({
          ...p,
          cost: p.cost + s,
          substitutions: p.substitutions + s,
        });
      }
      if (i) {
        const p = d[i - 1][j];
        options.push({ ...p, cost: p.cost + 1, deletions: p.deletions + 1 });
      }
      if (j) {
        const p = d[i][j - 1];
        options.push({ ...p, cost: p.cost + 1, insertions: p.insertions + 1 });
      }
      d[i][j] = options.sort((x, y) => x.cost - y.cost)[0];
    }
  return {
    ...d[a.length][b.length],
    referenceWords: a.length,
    hypothesisWords: b.length,
    rate: d[a.length][b.length].cost / a.length,
  };
}

const [reportPath, referencePath] = process.argv.slice(2);
if (!reportPath || !referencePath)
  throw new Error(
    "Usage: node scripts/evaluate-experiments.ts <report.json> <reference-map.json>",
  );
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const reference = JSON.parse(readFileSync(referencePath, "utf8")) as {
  audioSha256: string;
  lyrics: string[];
  references: LineReference[];
};
if (!report.experimentRuns?.length)
  throw new Error("No experiment runs in this report");
const results = [];
for (const run of report.experimentRuns) {
  const lyrics: string[] = Array.isArray(run.lyrics)
    ? run.lyrics
    : parseLyrics(String(report.alignment?.lyrics ?? ""));
  if (
    !referenceApplies(
      report.audio?.sha256,
      run.audio?.sha256,
      reference.audioSha256,
      lyrics,
      reference.lyrics,
    )
  )
    throw new Error("Audio hash or lyric lines differ from the reference map");
  if (run.secondsTested < run.audio.duration - 0.05)
    throw new Error("Experiment scoring requires a full-song run");
  if (run.settings?.dtype !== "q4" || run.settings?.device !== "webgpu")
    throw new Error("Expected q4 WebGPU controls");
  const analysis = inspectOutput(run.output, run.secondsTested);
  const forced = run.output.text_source === "provided-lyrics-not-recognized";
  const text = forced ? run.output.raw_asr_text : run.output.text;
  if (typeof text !== "string")
    throw new Error("Independent ASR text is missing");
  const lines = forced
    ? lyrics.map((line, lineIndex) => ({
        line,
        matched: true,
        start:
          run.output.chunks.find(
            (c: { lineIndex: number }) => c.lineIndex === lineIndex,
          )?.timestamp[0] ?? null,
      }))
    : alignMonotonic(analysis.words, lyrics);
  results.push({
    model: run.model,
    id: run.experimentId,
    settings: run.settings,
    elapsedMs: run.elapsedMs,
    textSource: forced ? "provided-lyrics" : "ASR",
    wordErrors: wordErrors(lyrics.join(" "), text),
    wordRecords: analysis.words.length,
    zeroLengthWords: analysis.words.filter(
      (w) => w.start !== null && w.start === w.end,
    ).length,
    anomalies: analysis.anomalies.length,
    lineTiming: scoreLineStarts(lines, reference.references),
  });
}
console.log(
  JSON.stringify(
    {
      audioSha256: reference.audioSha256,
      limits:
        "English diagnostic. WER uses independent ASR text even for forced alignment. Line references do not validate every word start/end. Error summaries exclude unmatched lines; success rates retain all eligible lines.",
      results,
    },
    null,
    2,
  ),
);
