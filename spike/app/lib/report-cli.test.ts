import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { MODEL, SETTINGS } from "./protocol.ts";

test("CLI recomputes successful raw output and preserves failed runs as excluded", () => {
  const dir = mkdtempSync(join(tmpdir(), "lyric-report-"));
  try {
    const run = {
      startedAt: "test",
      audio: { sha256: "hash", duration: 10 },
      secondsTested: 10,
      lyrics: ["Open gate"],
      elapsedMs: 100,
      output: {
        text: "Open gate",
        chunks: [{ text: "Open gate", timestamp: [1, 3] }],
      },
      analysis: { segments: [] },
      lines: [],
    };
    const report = {
      schema: 4,
      profile: { model: MODEL, settings: SETTINGS },
      audio: { sha256: "hash" },
      runs: [{ ...run, error: "aborted", output: undefined }, run],
    };
    const file = join(dir, "report.json"),
      ref = join(dir, "ref.json");
    writeFileSync(file, JSON.stringify(report));
    writeFileSync(
      ref,
      JSON.stringify({
        audioSha256: "hash",
        lyrics: ["Open gate"],
        references: [{ lineIndex: 0, start: 1 }],
      }),
    );
    const evaluate = () =>
      spawnSync(
        process.execPath,
        [
          new URL(
            "../../scripts/evaluate-report.ts",
            import.meta.url,
          ).pathname.replace(/^\/(?=[A-Za-z]:)/, ""),
          file,
          ref,
        ],
        { encoding: "utf8" },
      );
    const result = evaluate();
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.excluded.length, 1);
    assert.equal(parsed.results[0].segmentRecords, 1);
    assert.equal(parsed.results[0].lineTiming.withinOneSecond, 1);
    report.schema = 3;
    writeFileSync(file, JSON.stringify(report));
    assert.notEqual(evaluate().status, 0);
    report.schema = 4;
    report.audio.sha256 = "different";
    writeFileSync(file, JSON.stringify(report));
    assert.notEqual(evaluate().status, 0);
    report.audio.sha256 = "hash";
    report.profile.settings = { ...SETTINGS, dtype: "fp32" } as never;
    writeFileSync(file, JSON.stringify(report));
    assert.notEqual(evaluate().status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
