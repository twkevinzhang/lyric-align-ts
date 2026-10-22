import test from "node:test";
import assert from "node:assert/strict";
import * as protocol from "./protocol.ts";

test("lyric prompt retains the last 224 context tokens and the English decoder prefix", () => {
  assert.equal(typeof protocol.preparePrompt, "function");
  const context = Array.from({ length: 230 }, (_, i) => i);
  const result = protocol.preparePrompt(context, 999, [500, 501]);
  assert.equal(result.length, 227);
  assert.deepEqual(result.slice(0, 3), [999, 6, 7]);
  assert.deepEqual(result.slice(-3), [229, 500, 501]);
  assert.equal(context.length, 230);
});

test("word inspection preserves raw missing and zero durations instead of repairing them", () => {
  const result = protocol.inspectOutput(
    {
      text: "hello world",
      chunks: [
        { text: "hello", timestamp: [1, 1] },
        { text: "world", timestamp: [null, 2] },
      ],
    },
    3,
  );
  assert.deepEqual(
    result.words.map((w) => [w.start, w.end]),
    [
      [1, 1],
      [null, 2],
    ],
  );
  assert.equal(result.anomalies.length, 2);
});
