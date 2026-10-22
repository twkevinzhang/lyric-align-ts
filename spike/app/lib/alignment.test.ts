import test from "node:test";
import assert from "node:assert/strict";
import { align, similarity, groupWords, parseLyrics } from "./alignment.ts";

test("matches repeated lines to successive segments and leaves missing lyrics unmatched", () => {
  const segments = [
    { start: 1, end: 2, text: "Open the gate", words: [] },
    { start: 5, end: 6, text: "Open the gate", words: [] },
  ];
  const result = align(
    segments,
    ["Open the gate", "Completely unrelated sentence", "Open the gate"],
    1,
  );
  assert.deepEqual(
    result.map((r) => [r.start, r.matched]),
    [
      [1, true],
      [null, false],
      [5, true],
    ],
  );
});
test("SequenceMatcher preserves punctuation stripping and codepoint comparisons", () => {
  assert.equal(similarity("雨、空。", "雨空"), 1);
  assert.equal(similarity("a😀b", "a😀c"), 2 / 3);
  assert.equal(similarity("abcd", "abed"), 0.75);
});
test("word regrouping preserves all timed words and splits at configured pauses", () => {
  const result = groupWords([
    { text: "First", start: 1, end: 2 },
    { text: " line", start: 2, end: 3 },
    { text: "Next", start: 5, end: 6 },
  ]);
  assert.deepEqual(
    result.map((s) => [s.start, s.end, s.text]),
    [
      [1, 3, "First line"],
      [5, 6, "Next"],
    ],
  );
});
test("lyric parser skips section-only headings and retains lyrics after headings", () => {
  assert.deepEqual(
    parseLyrics(
      "# note\n[Verse 1]\n[Intro] (strings)\n[Chorus] Sing along\nActual line",
    ),
    ["[Chorus] Sing along", "Actual line"],
  );
});
