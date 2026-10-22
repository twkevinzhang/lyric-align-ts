import test from "node:test";
import assert from "node:assert/strict";
import {
  negativeDtw,
  alignmentMatrix,
  splitWordTokens,
  attachWords,
} from "./word-timing.ts";
test("negative DTW follows high diagonal and horizontal tie rule", () => {
  assert.deepEqual(
    negativeDtw([
      [4, -1, -1],
      [-1, 4, -1],
      [-1, -1, 4],
    ]),
    [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
  );
  assert.deepEqual(
    negativeDtw([
      [0, 0],
      [0, 0],
    ]),
    [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
  );
});
test("attention crops/renormalizes probabilities then text-axis normalization", () => {
  const m = alignmentMatrix(
    [
      [
        [0.1, 0.2, 0.7],
        [0.2, 0.1, 0.7],
      ],
    ],
    2,
    1,
  );
  assert.ok(Math.abs(m[0][0] + 1) < 1e-6);
  assert.ok(Math.abs(m[0][1] - 1) < 1e-6);
});
test("English punctuation tokens split, then append merges without changing word time", () => {
  const map: Record<number, string> = {
    1: " Hello",
    2: "lo",
    3: ",",
    4: " world",
    9: "<eot>",
  };
  assert.deepEqual(
    splitWordTokens(
      [1, 2, 3, 4, 9],
      (ids) => ids.map((i) => map[i]).join(""),
      9,
    ).map((w) => w.word),
    [" Hellolo", ",", " world", "<eot>"],
  );
  const segs = [{ seek: 0, start: 1, end: 4, tokens: [1, 3, 4] }];
  const r = attachWords(
    segs,
    [
      { word: " Hello", tokens: [1], start: 1, end: 2, probability: 0.8 },
      { word: ",", tokens: [3], start: 2, end: 2.1, probability: 0.5 },
      { word: " world", tokens: [4], start: 3, end: 4, probability: 0.9 },
    ],
    9,
    0,
  );
  assert.equal(r[0].words[0].word, " Hello,");
  assert.equal(r[0].words[0].end, 2);
});
