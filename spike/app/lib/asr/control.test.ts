import test from "node:test";
import assert from "node:assert/strict";
import {
  fallbackDecision,
  selectFallback,
  makePrompt,
  splitTimestamps,
  nextSeek,
  compressionRatio,
} from "./control.ts";
test("strict fallback thresholds and no-speech logprob exception", () => {
  assert.deepEqual(
    fallbackDecision({ avgLogprob: -1, compressionRatio: 2.4, noSpeech: 0.6 }),
    { retry: false, skip: false },
  );
  assert.deepEqual(
    fallbackDecision({
      avgLogprob: -1.01,
      compressionRatio: 3,
      noSpeech: 0.61,
    }),
    { retry: false, skip: true },
  );
  assert.deepEqual(
    fallbackDecision({ avgLogprob: -0.9, compressionRatio: 3, noSpeech: 0.9 }),
    { retry: true, skip: false },
  );
});
test("compression uses zlib-wrapped DEFLATE, including empty text", async () => {
  const { deflateSync } = await import("node:zlib");
  for (const text of ["", "hello world", "repeat ".repeat(200), "雨空"])
    assert.equal(
      await compressionRatio(text),
      Buffer.byteLength(text.trim()) /
        deflateSync(Buffer.from(text.trim())).length,
    );
});
test("exhausted fallback chooses best acceptable compression but final temperature controls reset", () => {
  const r = selectFallback([
    { avgLogprob: -0.2, compressionRatio: 3, temperature: 0 },
    { avgLogprob: -1.5, compressionRatio: 2, temperature: 0.2 },
    { avgLogprob: -2, compressionRatio: 1, temperature: 1 },
  ]);
  assert.equal(r.index, 1);
  assert.equal(r.temperature, 1);
});
test("prompt retains last 223 ASR tokens only, reset drops prior history", () => {
  const history = Array.from({ length: 300 }, (_, i) => i);
  assert.deepEqual(makePrompt(history, 0, 50257, 50360), [
    50360,
    ...history.slice(-223),
    50257,
  ]);
  assert.deepEqual(makePrompt(history, 300, 50257, 50360), [50257]);
});
test("timestamp pairs ignore unfinished tail; single ending consumes entire window", () => {
  const t = 50363;
  const r = splitTimestamps([t, 10, t + 100, t + 110, 11], t, 3000, 3000);
  assert.equal(r.seek, 3200);
  assert.deepEqual(
    r.segments.map((s) => [s.start, s.end]),
    [[30, 32]],
  );
  const e = splitTimestamps(
    [t, 10, t + 100, t + 110, 11, t + 200],
    t,
    3000,
    1200,
  );
  assert.equal(e.seek, 4200);
  assert.equal(e.singleEnding, true);
  assert.equal(nextSeek(3000, r, 32.3), 3230);
  assert.throws(() => nextSeek(3000, { ...r, seek: 3000 }, null), /progress/);
});
