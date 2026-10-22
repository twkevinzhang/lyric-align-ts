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

test("a completed run uses segment boundaries independently of lyric wording and WER", () => {
  const result = completeRun(
    {
      startedAt: "test",
      backend: "webgpu",
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
      engine: "upstream-port-v1",
      trace: [],
      text: "Open the door",
      segments: [{ text: "Open the door", start: 1, end: 9, words: [] }],
    },
    123,
  );
  assert.equal(result.lines![0].matched, true);
  assert.equal(result.lines![0].start, 1);
  assert.equal(result.lines![0].end, 9);
  assert.equal(result.lines![0].segmentIndex, 0);
  assert.equal(result.analysis!.segments.length, 1);
  assert.equal(result.wordErrors!.substitutions, 1);
  assert.equal(result.elapsedMs, 123);
});
test("changing supplied lyrics only changes post-ASR pairing; original words/tokens remain immutable", () => {
  const output = {
    engine: "upstream-port-v1",
    trace: [],
    text: "Open gate",
    segments: [
      {
        text: "Open gate",
        start: 1,
        end: 3,
        tokens: [1, 2],
        words: [
          { word: " Open", start: 1, end: 2 },
          { word: " gate", start: 2, end: 3 },
        ],
      },
    ],
  };
  const before = JSON.stringify(output);
  const base = {
    backend: "webgpu" as const,
    startedAt: "test",
    audio: {
      name: "synthetic",
      duration: 4,
      sampleRate: 16000,
      samples: 64000,
      sha256: "synthetic",
      decodeMs: 0,
    },
    secondsTested: 4,
  };
  const a = completeRun({ ...base, lyrics: ["Open gate"] }, output, 10);
  const b = completeRun({ ...base, lyrics: ["zzz"] }, output, 10);
  assert.deepEqual(a.analysis, b.analysis);
  assert.equal(a.lines![0].matched, true);
  assert.equal(b.lines![0].matched, false);
  assert.equal(JSON.stringify(output), before);
});
