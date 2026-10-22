import test from "node:test";
import assert from "node:assert/strict";
import { pythonRound } from "./rounding.ts";
test("Python decimal round uses exact binary value with ties to even", () => {
  for (const [a, b] of [
    [0.125, 0.12],
    [0.375, 0.38],
    [0.005, 0.01],
    [0.015, 0.01],
    [2.675, 2.67],
    [-0.125, -0.12],
  ])
    assert.equal(pythonRound(a, 2), b);
});
