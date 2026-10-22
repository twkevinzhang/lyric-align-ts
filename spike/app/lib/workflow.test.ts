import test from "node:test";
import assert from "node:assert/strict";
import * as reference from "./reference.ts";
import { completeRun } from "./workflow.ts";
test("reference scoring rejects partial audio even with matching identity and lyrics", () => {
  assert.equal(typeof reference.canScoreRun, "function");
  assert.equal(
    reference.canScoreRun(
      "hash",
      {
        audio: { sha256: "hash", duration: 200 },
        secondsTested: 30,
        lyrics: ["open gate"],
      },
      { audioSha256: "hash", lyrics: ["open gate"] },
    ),
    false,
  );
  assert.equal(
    reference.canScoreRun(
      "hash",
      {
        audio: { sha256: "hash", duration: 200 },
        secondsTested: 200,
        lyrics: ["open gate"],
      },
      { audioSha256: "hash", lyrics: ["open gate"] },
    ),
    true,
  );
  assert.equal(
    reference.canScoreRun(
      "replacement",
      {
        audio: { sha256: "hash", duration: 200 },
        secondsTested: 200,
        lyrics: ["open gate"],
      },
      { audioSha256: "hash", lyrics: ["open gate"] },
    ),
    false,
  );
});

test("a completed run exposes raw anomalies, missing lyric words and recognition errors independently", () => {
  const result = completeRun(
    {
      startedAt: "test",
      audio: {
        name: "synthetic",
        duration: 10,
        sampleRate: 16000,
        samples: 160000,
        sha256: "synthetic",
        decodeMs: 0,
      },
      lyrics: ["Open the gate"],
      secondsTested: 10,
    },
    {
      text: "Open the door",
      chunks: [
        { text: "Open", timestamp: [1, 2] },
        { text: "the", timestamp: [2, 3] },
        { text: "door", timestamp: [3, 3] },
      ],
    },
    123,
  );
  assert.equal(result.lines![0].matched, true);
  assert.equal(result.lines![0].words[2].start, null);
  assert.equal(result.analysis!.anomalies.length, 1);
  assert.equal(result.wordErrors!.substitutions, 1);
  assert.equal(result.elapsedMs, 123);
});
