import test from "node:test";
import assert from "node:assert/strict";
import { wordErrors } from "./word-errors.ts";
test("English WER counts a substitution and insertion while normalizing punctuation", () => {
  const result = wordErrors("Open the gate!", "open a gate now");
  assert.deepEqual(result, {
    cost: 2,
    substitutions: 1,
    deletions: 0,
    insertions: 1,
    referenceWords: 3,
    hypothesisWords: 4,
    rate: 2 / 3,
  });
});
