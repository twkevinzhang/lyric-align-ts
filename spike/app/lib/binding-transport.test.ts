import { test } from "node:test";
import assert from "node:assert/strict";
import { workerSession, type WorkerPort } from "./binding/transport.ts";

function port() {
  const sent: unknown[] = [];
  let terminated = 0;
  const worker: WorkerPort = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(message) {
      sent.push(message);
    },
    terminate() {
      terminated++;
    },
  };
  return {
    worker,
    sent,
    get terminated() {
      return terminated;
    },
  };
}
const context = () => ({ signal: new AbortController().signal });
test("cancel terminates pending inference, rejects ABORTED and repeated dispose is safe", async () => {
  const p = port(),
    session = workerSession(p.worker, "wasm"),
    abort = new AbortController();
  const task = session.prepare({}, { signal: abort.signal });
  const rejected = assert.rejects(task, { code: "ABORTED" });
  abort.abort();
  await rejected;
  await session.dispose();
  await session.dispose();
  assert.equal(p.terminated, 1);
  await assert.rejects(session.prepare({}, context()), {
    code: "INVALID_INPUT",
  });
});
test("transport rejects overlap, forwards progress and returns result without detaching caller PCM", async () => {
  const p = port(),
    session = workerSession(p.worker, "wasm"),
    events: unknown[] = [];
  const task = session.prepare(
    {},
    { ...context(), onProgress: (e) => events.push(e) },
  );
  await assert.rejects(session.prepare({}, context()), {
    code: "INVALID_INPUT",
  });
  p.worker.onmessage?.({
    data: {
      id: 1,
      progress: {
        phase: "preparing-model",
        sequence: 1,
        kind: "indeterminate",
      },
    },
  } as MessageEvent);
  p.worker.onmessage?.({ data: { id: 1, result: undefined } } as MessageEvent);
  await task;
  assert.equal(events.length, 1);
  const pcm = new Float32Array([1]);
  const inference = session.transcribe(
    { pcm, sampleRate: 16000 },
    {},
    context(),
  );
  p.worker.onmessage?.({
    data: { id: 2, result: [{ start: 0, end: 1, text: "a" }] },
  } as MessageEvent);
  assert.deepEqual(await inference, [{ start: 0, end: 1, text: "a" }]);
  assert.equal(pcm[0], 1);
  const disposal = session.dispose();
  p.worker.onmessage?.({ data: { id: 3, result: undefined } } as MessageEvent);
  await disposal;
  assert.equal(p.terminated, 1);
});
test("worker crash and serialization failure settle operation and release worker", async () => {
  for (const crash of [true, false]) {
    const p = port(),
      session = workerSession(p.worker, "webgpu");
    if (!crash)
      p.worker.postMessage = () => {
        throw Error("serialization failed");
      };
    const task = session.prepare({}, context());
    if (crash)
      p.worker.onerror?.({
        message: "worker failed",
        preventDefault() {},
      } as ErrorEvent);
    await assert.rejects(task, { code: "MODEL_LOAD_FAILED" });
    await session.dispose();
    assert.equal(p.terminated, 1);
  }
});
