import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  autoPairing,
  splitWordsByBreath,
  alignSegments,
} from "./segment-alignment.ts";
test("auto clamps 1..3 and uses Python ties-to-even", () => {
  const s = Array(2).fill({ text: "", start: 0, end: 1 });
  assert.equal(autoPairing(Array(5).fill("a"), s), 2);
  assert.equal(autoPairing(Array(7).fill("a"), s), 3);
  assert.equal(autoPairing([], s), 1);
  assert.equal(autoPairing(["a"], []), 1);
});
test("breath uses character ratio, earliest gap tie, and preserves empty groups", () => {
  const w = Array.from({ length: 6 }, (_, i) => ({
    word: String(i),
    start: i,
    end: i + 0.5,
  }));
  assert.deepEqual(
    splitWordsByBreath(w, ["abc", "def"]).map((g) => g.map((w) => w.word)),
    [["0"], ["1", "2", "3", "4", "5"]],
  );
  assert.deepEqual(
    splitWordsByBreath(w.slice(0, 1), ["a", "b", "c"]).map((g) => g.length),
    [1, 0, 0],
  );
});
test("auto groups lines; missing words falls back to original segment for every line", () => {
  const lines = ["one", "two", "three", "four", "five"];
  const rows = alignSegments(
    [
      { text: "one two", start: 1, end: 5 },
      { text: "three four five", start: 6, end: 9 },
    ],
    lines,
    "auto",
  );
  assert.deepEqual(
    rows.map((r) => r.start),
    [1, 1, 6, 6, null],
  );
  assert.equal(rows[0].pairing, 2);
});
test("auto and breath agree with unmodified Python upstream across fixed cases", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL("./fixtures/upstream-auto.json", import.meta.url),
      "utf8",
    ),
  );
  for (const c of fixture.cases) {
    assert.equal(autoPairing(c.lyrics, c.segments), c.pairing);
    assert.deepEqual(
      alignSegments(c.segments, c.lyrics, "auto").map(
        ({ line, start, end, score, matched }) => ({
          line,
          start,
          end,
          score,
          matched,
        }),
      ),
      c.expected,
    );
  }
  for (const c of fixture.breath)
    assert.deepEqual(
      splitWordsByBreath(c.words, c.lines).map((g) => g.map((w) => w.word)),
      c.expected,
    );
});
