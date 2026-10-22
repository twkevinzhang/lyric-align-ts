import test from "node:test";
import assert from "node:assert/strict";
import { parseSrt, scoreLineStarts, referenceApplies } from "./reference.ts";

test("a previous run cannot be scored as the currently selected replacement audio", () => {
  assert.equal(
    referenceApplies("new-audio", "old-audio", "old-audio", ["Line"], ["Line"]),
    false,
  );
  assert.equal(
    referenceApplies(
      "same-audio",
      "same-audio",
      "same-audio",
      ["Edited line"],
      ["Original line"],
    ),
    false,
  );
  assert.equal(
    referenceApplies(
      "same-audio",
      "same-audio",
      "same-audio",
      ["Line"],
      ["Line"],
    ),
    true,
  );
});

test("SRT parser retains millisecond precision and joins caption lines", () => {
  const cues = parseSrt(
    "\uFEFF1\r\n00:01:02,345 --> 00:01:06,700\r\nFirst\r\nsecond\r\n",
  );
  assert.deepEqual(cues, [
    { id: 1, start: 62.345, end: 66.7, text: "First second" },
  ]);
});

test("malformed or reversed reference times fail instead of yielding silent scores", () => {
  assert.throws(() => parseSrt("1\n00:00:03,000 --> 00:00:02,000\nText"));
  assert.throws(() => parseSrt("1\n00:00:99,000 --> 00:01:40,000\nText"));
});

test("quality denominator includes unmatched lines and excludes unknown reference starts", () => {
  const result = scoreLineStarts(
    [
      { start: 10.25, matched: true },
      { start: 22, matched: true },
      { start: null, matched: false },
      { start: 40, matched: true },
    ],
    [
      { lineIndex: 0, start: 10 },
      { lineIndex: 1, start: 20 },
      { lineIndex: 2, start: 30 },
      { lineIndex: 3, start: null },
    ],
  );
  assert.equal(result.eligible, 3);
  assert.equal(result.matched, 2);
  assert.equal(result.unmatched, 1);
  assert.equal(result.excluded, 1);
  assert.equal(result.withinHalfSecond, 1);
  assert.equal(result.withinHalfSecondRate, 1 / 3);
  assert.equal(result.medianAbsError, 1.125);
  assert.equal(result.p90AbsError, 2);
});

test("no matched lines yields null error statistics, not zero error", () => {
  const result = scoreLineStarts(
    [{ start: null, matched: false }],
    [{ lineIndex: 0, start: 10 }],
  );
  assert.equal(result.meanAbsError, null);
  assert.equal(result.medianAbsError, null);
  assert.equal(result.p90AbsError, null);
  assert.equal(result.withinHalfSecondRate, 0);
});
