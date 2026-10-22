import test from "node:test";
import assert from "node:assert/strict";
import * as protocol from "./protocol.ts";

test("segment inspection preserves raw missing and zero durations instead of repairing them", () => {
  const result = protocol.inspectOutput(
    {
      engine: "upstream-port-v1",
      trace: [],
      text: "hello world",
      segments: [
        {
          text: "hello",
          start: 1,
          end: 1,
          words: [{ word: "hello", start: 1, end: 1 }],
        },
        { text: "world", start: null, end: 2, words: [] },
      ],
    },
    3,
  );
  assert.deepEqual(
    result.segments.map((w) => [w.start, w.end]),
    [
      [1, 1],
      [null, 2],
    ],
  );
  assert.equal(result.anomalies.length, 2);
  assert.equal(result.segments[0].words?.[0].word, "hello");
});

test("missing or malformed output is rejected instead of silently reconstructing segments", () => {
  assert.throws(() => protocol.inspectOutput({ text: "hello" }, 3));
  assert.throws(() =>
    protocol.inspectOutput(
      { text: "hello", chunks: [{ text: 42, timestamp: [1, 2] }] },
      3,
    ),
  );
});
