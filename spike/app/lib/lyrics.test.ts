import test from "node:test";
import assert from "node:assert/strict";
import { parseLyrics } from "./lyrics.ts";
test("upstream lyric parsing drops parenthesized markers and multiple arrangement notes, but keeps inline lyrics", () => {
  assert.deepEqual(
    parseLyrics(
      "# comment\n\n(Verse)\n[Intro] (soft) （strings）\n[Chorus] Sing along\nSing (again)\nAmen",
    ),
    ["[Chorus] Sing along", "Sing (again)", "Amen"],
  );
});
