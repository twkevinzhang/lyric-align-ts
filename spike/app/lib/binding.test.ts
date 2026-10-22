import { test } from "node:test";
import assert from "node:assert/strict";
import { createCore } from "./binding/core.ts";
import { createBinding } from "./binding/index.ts";

const context = () => ({ signal: new AbortController().signal });
const segment = { start: 1, end: 2, text: "Hello world" };
const runtime = () => ({
  load: async (_device: string, progress?: (data: unknown) => void) => {
    progress?.({ status: "progress", file: "weights", loaded: 4, total: 8 });
  },
  release: async () => {},
});

test("session preserves exact lines and unmatched nulls, and applies explicit threshold/window", async () => {
  const session = createCore("wasm", runtime, async () => [segment]);
  await session.prepare({}, context());
  const result = await session.align(
    [segment],
    [" Hello world ", "Missing"],
    { pairing: 1 },
    context(),
  );
  assert.deepEqual(
    result.map((x) => x.line),
    [" Hello world ", "Missing"],
  );
  assert.equal(result[0].start, 1);
  assert.deepEqual(
    [result[1].matched, result[1].start, result[1].end],
    [false, null, null],
  );
  assert.equal(
    (
      await session.align(
        [segment],
        ["Hello world"],
        { threshold: 1 },
        context(),
      )
    )[0].matched,
    false,
  );
  assert.equal(
    (
      await session.align(
        [{ ...segment, text: "other" }, segment],
        ["Hello world"],
        { window: 1 },
        context(),
      )
    )[0].matched,
    false,
  );
  await session.dispose();
});

test("rejects unsupported language/context/options and malformed inputs without inference", async () => {
  const session = createCore("wasm", runtime, async () => {
    throw Error("must not infer");
  });
  await assert.rejects(session.prepare({ language: "ja" }, context()), {
    code: "UNSUPPORTED_LANGUAGE",
  });
  await session.prepare({}, context());
  await assert.rejects(
    session.transcribe(
      { pcm: new Float32Array([NaN]), sampleRate: 16000 },
      {},
      context(),
    ),
    { code: "INVALID_INPUT" },
  );
  await assert.rejects(
    session.transcribe(
      { pcm: new Float32Array([0]), sampleRate: 16000 },
      { lyricsContext: ["hi"] },
      context(),
    ),
    { code: "UNSUPPORTED_OPTION" },
  );
  await assert.rejects(
    session.align([segment], ["hi"], { window: 0 }, context()),
    { code: "INVALID_INPUT" },
  );
  await assert.rejects(
    session.align([{ ...segment, end: Infinity }], ["hi"], {}, context()),
    { code: "INVALID_INPUT" },
  );
  await session.dispose();
});

test("progress is phase-local and measured only from real totals; dispose is idempotent", async () => {
  let released = 0;
  const session = createCore(
    "wasm",
    () => ({
      ...runtime(),
      release: async () => {
        released++;
      },
    }),
    async () => [segment],
  );
  const events: unknown[] = [];
  await session.prepare(
    {},
    { ...context(), onProgress: (e) => events.push(e) },
  );
  assert.deepEqual(events, [
    { phase: "preparing-model", sequence: 1, kind: "indeterminate" },
    {
      phase: "preparing-model",
      sequence: 2,
      kind: "measured",
      completed: 4,
      total: 8,
      unit: "bytes",
      scope: "weights",
    },
  ]);
  assert.deepEqual(
    await session.transcribe(
      { pcm: new Float32Array(32000), sampleRate: 16000 },
      {},
      context(),
    ),
    [segment],
  );
  await session.dispose();
  await session.dispose();
  assert.equal(released, 1);
  await assert.rejects(session.prepare({}, context()), {
    code: "INVALID_INPUT",
  });
});

test("binding reports fixed immutable capabilities and rejects unknown backend configuration", async () => {
  const binding = createBinding({ device: "wasm" });
  assert.equal(binding.capabilities.model.device, "wasm");
  assert.deepEqual(binding.capabilities.supportedLanguages, ["en"]);
  assert.equal(binding.capabilities.lyricsContext, false);
  assert.ok(Object.isFrozen(binding.capabilities.model));
  assert.throws(() => createBinding({ device: "cuda" as "wasm" }), {
    code: "UNSUPPORTED_DEVICE",
  });
  await assert.rejects(binding.createSession(), { code: "UNSUPPORTED_DEVICE" });
});

test("malformed options and empty lyrics reject as INVALID_INPUT; pre-abort does not load", async () => {
  let loads = 0;
  const session = createCore(
    "wasm",
    () => ({
      ...runtime(),
      load: async () => {
        loads++;
      },
    }),
    async () => [],
  );
  await assert.rejects(session.prepare(null as never, context()), {
    code: "INVALID_INPUT",
  });
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(session.prepare({}, { signal: abort.signal }), {
    code: "ABORTED",
  });
  assert.equal(loads, 0);
  await session.prepare({}, context());
  await assert.rejects(session.align([], [], {}, context()), {
    code: "INVALID_INPUT",
  });
  await session.dispose();
});

test("ASR zero-duration words remain valid evidence without rejecting positive-duration segments", async () => {
  const segments = [
    {
      start: 0,
      end: 2,
      text: "Hello world",
      words: [
        { start: 0, end: 0, word: "Hello" },
        { start: 0, end: 2, word: "world" },
      ],
    },
  ];
  const session = createCore("wasm", runtime, async () => segments);
  await session.prepare({}, context());
  assert.deepEqual(
    await session.transcribe(
      { pcm: new Float32Array(32000), sampleRate: 16000 },
      {},
      context(),
    ),
    segments,
  );
  const lines = await session.align(segments, ["Hello world"], {}, context());
  assert.deepEqual([lines[0].start, lines[0].end], [0, 2]);
  await session.dispose();
});

test("model and inference failures expose stable codes and release resources once", async () => {
  let released = 0;
  const session = createCore(
    "wasm",
    () => ({
      load: async () => {
        throw Error("download unavailable");
      },
      release: async () => {
        released++;
      },
    }),
    async () => [],
  );
  await assert.rejects(session.prepare({}, context()), {
    code: "MODEL_LOAD_FAILED",
  });
  await session.dispose();
  assert.equal(released, 1);
  const oom = createCore("wasm", runtime, async () => {
    throw Error("out of memory");
  });
  await oom.prepare({}, context());
  await assert.rejects(
    oom.transcribe(
      { pcm: new Float32Array(1), sampleRate: 16000 },
      {},
      context(),
    ),
    { code: "OUT_OF_MEMORY" },
  );
  await oom.dispose();
});
