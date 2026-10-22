import test from "node:test";
import assert from "node:assert/strict";
import { transcribe } from "./transcribe.ts";
test("controller reuses encoder for retries, preserves provenance, and resets context above .5", async () => {
  let encodes = 0,
    calls = 0;
  const prompts: number[][] = [];
  const runtime = {
    async forward() {
      throw Error("unused");
    },
    async clone() {
      return {};
    },
    async dispose() {},
    async features() {
      return { frames: 4001, bands: 80, data: new Float32Array(0) };
    },
    async encode() {
      encodes++;
    },
    async clearWindow() {},
    token(s: string) {
      return s === "<|startoftranscript|>"
        ? 9
        : s === "<|startofprev|>"
          ? 8
          : 7;
    },
    rules() {
      return {
        eos: 5,
        timestamp: 10,
        noTimestamps: 6,
        suppress: [],
        blank: [],
        maxInitial: 50,
      };
    },
    text(t: number[]) {
      return t.includes(1) ? " hello" : " world";
    },
    async align() {
      return { words: [], jumps: [] };
    },
  };
  const result = await transcribe(
    runtime,
    new Float32Array(1),
    () => {},
    async (_runtime, prompt, options) => {
      prompts.push(prompt);
      calls++;
      return {
        tokens: [10, 1, 1510],
        noSpeech: 0,
        avgLogprob: calls < 4 ? -2 : -0.5,
        score: -1,
        sumLogprob: -1,
        finished: [],
        trace: [],
        reason: "eos",
        ...{ temperature: options.temperature },
      };
    },
  );
  assert.equal(encodes, 2);
  assert.equal(calls, 5);
  assert.deepEqual(prompts[4], [9]);
  assert.equal(result.trace[0].attempts.length, 4);
  assert.equal(result.trace[0].reset, true);
  assert.equal(result.trace[1].seek, 3000);
});
test("no-speech consumes the full window and does not add generated tokens to context", async () => {
  let cleared = 0;
  const runtime = {
    async features() {
      return { frames: 3001, bands: 80, data: new Float32Array(0) };
    },
    async encode() {},
    async clearWindow() {
      cleared++;
    },
    async forward() {
      throw Error("unused");
    },
    async clone() {
      return {};
    },
    async dispose() {},
    token() {
      return 9;
    },
    rules() {
      return {
        eos: 5,
        timestamp: 10,
        noTimestamps: 6,
        suppress: [],
        blank: [],
        maxInitial: 50,
      };
    },
    text() {
      return "noise";
    },
    async align() {
      throw Error("silence must not align");
    },
  };
  const result = await transcribe(
    runtime,
    new Float32Array(1),
    () => {},
    async () => ({
      tokens: [10, 1, 20],
      noSpeech: 0.9,
      avgLogprob: -2,
      score: -2,
      sumLogprob: -6,
      finished: [],
      trace: [],
      reason: "eos",
    }),
  );
  assert.deepEqual(result.history, []);
  assert.equal(result.trace[0].nextSeek, 3000);
  assert.equal(result.trace[0].skip, true);
  assert.equal(result.trace[0].attempts.length, 1);
  assert.ok(cleared > 0);
});
