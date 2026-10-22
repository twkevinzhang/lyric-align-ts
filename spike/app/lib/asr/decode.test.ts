import test from "node:test";
import assert from "node:assert/strict";
import { search, maskLogits, generationBudget, logSoftmax } from "./decode.ts";
test("beam explores lower local choice and frees all independent states", async () => {
  let live = 0;
  const runtime = {
    async forward(ids: number[], cache?: number[]) {
      live++;
      const seq = [...(cache ?? []), ...ids];
      const values =
        seq.length === 1
          ? [0.51, 0.49, 0.00001]
          : seq.at(-1) === 0
            ? [0.45, 0.45, 0.1]
            : [0.001, 0.001, 0.998];
      return { logits: Float32Array.from(values.map(Math.log)), cache: seq };
    },
    async clone(c: number[]) {
      live++;
      return [...c];
    },
    async dispose() {
      live--;
    },
  };
  const r = await search(runtime, [9], {
    eos: 2,
    beam: 2,
    maxSteps: 2,
    temperature: 0,
    mask: (x) => x,
  });
  assert.deepEqual(r.tokens, [1]);
  assert.equal(live, 0);
  assert.equal(r.finished.length >= 2, true);
});
test("sampling best_of uses controlled RNG, retains original logprob scores", async () => {
  const runtime = {
    async forward() {
      return { logits: new Float32Array([0, -1]), cache: {} };
    },
    async clone() {
      return {};
    },
    async dispose() {},
  };
  const r = await search(runtime, [5], {
    eos: 1,
    beam: 5,
    maxSteps: 1,
    temperature: 0.2,
    mask: (x) => x,
    random: () => 0.99999,
  });
  assert.deepEqual(r.tokens, []);
  assert.ok(Math.abs(r.sumLogprob - logSoftmax([0, -1])[1]) < 1e-6);
  assert.equal(r.finished.length, 5);
});
test("sampling RNG zero never selects a masked zero-probability token", async () => {
  const runtime = {
    async forward() {
      return { logits: new Float32Array([-Infinity, 0]), cache: {} };
    },
    async clone() {
      return {};
    },
    async dispose() {},
  };
  const r = await search(runtime, [5], {
    eos: 1,
    beam: 5,
    maxSteps: 1,
    temperature: 1,
    mask: (x) => x,
    random: () => 0,
  });
  assert.deepEqual(r.tokens, []);
  assert.equal(r.sumLogprob, 0);
});
test("CT2 budget and timestamp pairing/monotonicity/initial limit", () => {
  assert.equal(generationBudget(1), 224);
  assert.equal(generationBudget(225), 224);
  const c = {
    eos: 3,
    timestamp: 6,
    noTimestamps: 5,
    suppress: [],
    blank: [3],
    maxInitial: 1,
  };
  const base = new Float32Array(10).fill(0);
  assert.deepEqual(
    Array.from(maskLogits(base, [], c))
      .map((x, i) => (Number.isFinite(x) ? i : -1))
      .filter((i) => i >= 0),
    [6, 7],
  );
  assert.equal(maskLogits(base, [6], c)[6], -Infinity);
  assert.equal(maskLogits(base, [6, 1], c)[6], -Infinity);
  assert.equal(maskLogits(base, [6, 1, 8], c)[1], -Infinity);
});
test("decoder cleans root and branch caches when a later forward throws", async () => {
  let live = 0,
    calls = 0;
  const runtime = {
    async forward() {
      if (++calls === 3) throw Error("forward failed");
      live++;
      return { logits: new Float32Array([0, 0, -10]), cache: {} };
    },
    async clone() {
      live++;
      return {};
    },
    async dispose() {
      live--;
    },
  };
  await assert.rejects(
    search(runtime, [9], {
      eos: 2,
      beam: 2,
      maxSteps: 3,
      temperature: 0,
      mask: (x) => x,
    }),
    /forward failed/,
  );
  assert.equal(live, 0);
});
test("token budget stops at the exact configured boundary without inventing EOS", async () => {
  const runtime = {
    async forward() {
      return {
        logits: new Float32Array([...Array(10).fill(0), -Infinity]),
        cache: {},
      };
    },
    async clone() {
      return {};
    },
    async dispose() {},
  };
  const r = await search(runtime, [9], {
    eos: 10,
    beam: 5,
    maxSteps: 224,
    temperature: 0,
    mask: (x) => x,
  });
  assert.equal(r.tokens.length, 224);
  assert.equal(r.reason, "limit");
  assert.equal(r.trace.length, 224);
});
