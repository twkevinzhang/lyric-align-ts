import test from "node:test";
import assert from "node:assert/strict";
import { Tensor } from "@huggingface/transformers";
import { withPromptRowTimingFix } from "./timestamp-experiment.ts";

test("timing control retains the last prompt attention row and preserves batch boundaries", async () => {
  const prefixes: number[] = [];
  const original = (
    _outputs: unknown,
    _heads: number[][],
    _frames?: number,
    _precision?: number,
    prefix = 0,
  ) => {
    prefixes.push(prefix);
    return new Tensor(
      "float32",
      new Float32Array([0, 0, 0.2, 0.5, 0.8, 0.8, 0, 0, 0.3, 0.6, 0.9, 0.9]),
      [2, 6],
    );
  };
  const model = { _extract_token_timestamps: original };
  const actual = await withPromptRowTimingFix(model, async () =>
    model._extract_token_timestamps({}, [], 10, 0.02, 3),
  );
  assert.deepEqual(prefixes, [2]);
  assert.deepEqual(
    Array.from(actual.data as Float32Array),
    Array.from(
      new Float32Array([0, 0, 0, 0.2, 0.5, 0.8, 0, 0, 0, 0.3, 0.6, 0.9]),
    ),
  );
  assert.equal(model._extract_token_timestamps, original);
});

test("timing experiment restores the original extractor after a failed inference", async () => {
  const original = () => new Tensor("float32", new Float32Array(1), [1, 1]);
  const model = { _extract_token_timestamps: original };
  await assert.rejects(
    withPromptRowTimingFix(model, async () => {
      throw new Error("inference failed");
    }),
    /inference failed/,
  );
  assert.equal(model._extract_token_timestamps, original);
});
