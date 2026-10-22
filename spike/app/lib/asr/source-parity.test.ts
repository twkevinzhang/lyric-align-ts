import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { splitTimestamps } from "./control.ts";
import { attachWords } from "./word-timing.ts";
const fixture = JSON.parse(
  readFileSync(
    new URL("../fixtures/upstream-control.json", import.meta.url),
    "utf8",
  ),
);
test("timestamp segments/seek agree with 150 source-extracted Python cases", () => {
  for (const c of fixture.splits)
    assert.deepEqual(
      splitTimestamps(c.tokens, 50363, c.seek, c.size),
      c.expected,
    );
});
test("word punctuation and boundary rules agree with 80 source-extracted Python cases", () => {
  for (const c of fixture.words)
    assert.deepEqual(
      attachWords(c.segments, c.alignment, 50256, c.lastSpeech),
      c.expected,
    );
});
