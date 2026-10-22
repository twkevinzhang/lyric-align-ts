import test from "node:test";
import assert from "node:assert/strict";
import { ctcAlign } from "./ctc-alignment.ts";
const logs = (rows: number[][]) =>
  new Float32Array(rows.flatMap((r) => r.map(Math.log)));
test("known text stays after leading silence and repeated labels require a blank", () => {
  const p = logs([
    [0.99, 0.01],
    [0.01, 0.99],
    [0.99, 0.01],
    [0.01, 0.99],
    [0.99, 0.01],
  ]);
  assert.deepEqual(
    ctcAlign(p, 5, 2, [1, 1], 0).map((s) => [s.startFrame, s.endFrame]),
    [
      [1, 2],
      [3, 4],
    ],
  );
});
test("different adjacent labels may transition without a blank", () => {
  const p = logs([
    [0.98, 0.01, 0.01],
    [0.01, 0.98, 0.01],
    [0.01, 0.01, 0.98],
    [0.98, 0.01, 0.01],
  ]);
  assert.deepEqual(
    ctcAlign(p, 4, 3, [1, 2], 0).map((s) => [s.startFrame, s.endFrame]),
    [
      [1, 2],
      [2, 3],
    ],
  );
});
test("impossible or non-finite inputs fail rather than inventing times", () => {
  assert.throws(
    () => ctcAlign(logs([[0.01, 0.99]]), 1, 2, [1, 1], 0),
    /cannot fit/,
  );
  assert.throws(
    () => ctcAlign(new Float32Array([NaN, 0]), 1, 2, [1], 0),
    /Non-finite/,
  );
});
