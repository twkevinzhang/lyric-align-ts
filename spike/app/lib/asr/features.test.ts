import test from "node:test";
import assert from "node:assert/strict";
import { featureWindow, featureFrameCount } from "./features.ts";
test("whole-song frame count includes one hop padding and excludes last STFT frame", () => {
  assert.equal(featureFrameCount(480000), 3001);
  assert.equal(featureFrameCount(160), 2);
  assert.equal(featureFrameCount(480001), 3001);
});
test("feature window slices channels separately and pads tail with zero feature values", () => {
  const f = {
    data: new Float32Array([1, 2, 3, 4, 10, 20, 30, 40]),
    frames: 4,
    bands: 2,
  };
  assert.deepEqual(Array.from(featureWindow(f, 2, 3)), [3, 0, 0, 30, 0, 0]);
});
test("exact 30 seconds excludes the extra feature frame from encoder padding", () => {
  const data = new Float32Array(3001).fill(1);
  data[3000] = 999;
  const f = { data, frames: 3001, bands: 1 };
  assert.equal(featureWindow(f, 0).at(-1), 1);
  assert.deepEqual(Array.from(featureWindow(f, 2999, 3)), [1, 0, 0]);
});
