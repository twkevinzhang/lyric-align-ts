import test from "node:test";
import assert from "node:assert/strict";
import { alignMonotonic } from "./monotonic-alignment.ts";
const words = (text: string, start = 1) =>
  text
    .split(" ")
    .map((text, i) => ({ text, start: start + i, end: start + i + 0.5 }));

test("negative and out-of-audio timestamps stay raw but cannot become lyric timestamps", () => {
  for (const start of [-2, 20]) {
    const result = alignMonotonic(
      words("Open the gate", start),
      ["Open the gate"],
      10,
    )[0];
    assert.equal(result.matched, false);
    assert.equal(result.start, null);
    assert.equal(result.words[0].start, null);
  }
});
test("recovers an exact line after more than four unrelated words", () => {
  const result = alignMonotonic(
    words("noise noise noise noise noise Open the gate"),
    ["Open the gate"],
  );
  assert.equal(result[0].start, 6);
});
test("repeated lyric lines map to separate successive occurrences", () => {
  const result = alignMonotonic(words("Open the gate Open the gate"), [
    "Open the gate",
    "Open the gate",
  ]);
  assert.deepEqual(
    result.map((r) => r.start),
    [1, 4],
  );
});
test("missing prefixes or invalid times do not receive interpolated starts", () => {
  assert.equal(
    alignMonotonic(words("the gate"), ["Open the gate"])[0].matched,
    false,
  );
  const input = words("Open the gate");
  input[0].end = input[0].start;
  assert.equal(alignMonotonic(input, ["Open the gate"])[0].start, null);
});

test("lyric words retain exact ASR indices and leave substitutions and invalid times empty", () => {
  const input = words("Open the door again");
  input[3].end = input[3].start;
  const result = alignMonotonic(input, ["Open the gate again"])[0];
  assert.deepEqual(
    result.words.map((w) => [w.text, w.sourceIndex, w.start, w.end]),
    [
      ["open", 0, 1, 1.5],
      ["the", 1, 2, 2.5],
      ["gate", null, null, null],
      ["again", 3, null, null],
    ],
  );
});
