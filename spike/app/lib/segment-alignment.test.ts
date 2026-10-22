import test from "node:test";
import assert from "node:assert/strict";
import { alignSegments, similarity } from "./segment-alignment.ts";

test("pairing 1 takes raw segment boundaries even when word boundaries differ", () => {
  const rows = alignSegments(
    [
      {
        start: 1,
        end: 9,
        text: "Open the door",
        words: [{ start: 3, end: 5, word: "Open" }],
      },
    ],
    ["Open the gate"],
  );
  assert.deepEqual(
    rows.map(({ start, end, matched }) => ({ start, end, matched })),
    [{ start: 1, end: 9, matched: true }],
  );
});

test("window 4 excludes the fifth segment and a failed lyric does not advance the cursor", () => {
  const segments = ["qqq", "xxx", "zzz", "vvv", "Open gate"].map((text, i) => ({
    text,
    start: i,
    end: i + 0.8,
  }));
  const rows = alignSegments(segments, [
    "Open gate",
    "qqq",
    "xxx",
    "zzz",
    "vvv",
    "Open gate",
  ]);
  assert.deepEqual(
    rows.map((r) => r.start),
    [null, 0, 1, 2, 3, 4],
  );
});

test("ties consume the earliest repeated segment; single word lyrics can match", () => {
  const rows = alignSegments(
    [
      { text: "Amen", start: 1, end: 2 },
      { text: "Amen", start: 4, end: 5 },
    ],
    ["Amen", "Amen", "Amen"],
  );
  assert.deepEqual(
    rows.map((r) => r.start),
    [1, 4, null],
  );
});

test("threshold is strict, case is preserved, and similarity uses characters", () => {
  assert.equal(similarity("ab", "ac"), 0.5);
  assert.equal(
    alignSegments([{ text: "ac", start: 1, end: 2 }], ["ab"])[0].matched,
    false,
  );
  assert.equal(similarity("ABC", "abc"), 0);
  assert.equal(similarity("「雨 空！」", "雨空"), 1);
  assert.equal(similarity("", ""), 1);
});
