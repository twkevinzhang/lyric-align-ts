import test from "node:test";
import assert from "node:assert/strict";
import { nativeSegments } from "./native-segments.ts";

test("native adapter retains model segment spans and assigns boundary words only once", () => {
  const result = nativeSegments(
    [
      { text: "First", timestamp: [1, 2] },
      { text: "Next", timestamp: [2, 4] },
    ],
    [
      { text: "First", start: 1.1, end: 1.9 },
      { text: "Next", start: 2, end: 3 },
    ],
  );
  assert.deepEqual(
    result.segments.map((s) => [s.start, s.end, s.words.length]),
    [
      [1, 2, 1],
      [2, 4, 1],
    ],
  );
  assert.deepEqual(result.unassignedWords, []);
});
test("unknown native endpoints and out-of-segment words are reported rather than guessed", () => {
  const result = nativeSegments(
    [
      { text: "Unknown", timestamp: [null, 2] },
      { text: "Valid", timestamp: [3, 4] },
    ],
    [
      { text: "Outside", start: 1, end: 2 },
      { text: "Valid", start: 3.1, end: 3.8 },
    ],
  );
  assert.deepEqual(result.rejectedChunks, [0]);
  assert.deepEqual(result.unassignedWords, [0]);
});
