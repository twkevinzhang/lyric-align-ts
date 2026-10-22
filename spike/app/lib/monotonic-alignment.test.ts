import test from "node:test";
import assert from "node:assert/strict";
import { alignMonotonic } from "./monotonic-alignment.ts";
const words = (text: string, start = 1) =>
  text
    .split(" ")
    .map((text, i) => ({ text, start: start + i, end: start + i + 0.5 }));
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
