import { WhisperRuntime, type Backend } from "./lib/asr/runtime.ts";
import { transcribe, AsrFailure } from "./lib/asr/transcribe.ts";
import {
  MODEL,
  SETTINGS,
  jsHeap,
  type Command,
  type WorkerEvent,
} from "./lib/protocol";

let transcriber: WhisperRuntime | null = null;
let backend: Backend = "webgpu";
let busy = false;
const send = (event: WorkerEvent) => self.postMessage(event);
self.onmessage = async ({ data }: MessageEvent<Command>) => {
  if (busy) return send({ type: "error", message: "上一個操作尚未完成。" });
  busy = true;
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    if (data.type === "load") {
      if (transcriber) throw new Error("模型已載入。");
      const started = performance.now();
      if (!["wasm", "webgpu"].includes(data.backend))
        throw Error("不支援的後端");
      backend = data.backend;
      transcriber = new WhisperRuntime();
      await transcriber.load(backend, (data) =>
        send({ type: "progress", data }),
      );
      send({ type: "ready", elapsedMs: performance.now() - started });
    } else if (data.type === "run") {
      if (!transcriber) throw new Error("模型尚未載入。");
      transcriber.resetRunMetrics();
      const started = performance.now();
      timer = setInterval(
        () =>
          send({
            type: "tick",
            elapsedMs: performance.now() - started,
            jsHeapBytes: jsHeap(),
          }),
        1000,
      );
      const result = await transcribe(
        transcriber,
        data.audio,
        (message) => send({ type: "status", message }),
        undefined,
        (trace) => send({ type: "trace", trace }),
      );
      const output = {
        ...result,
        model: MODEL,
        settings: SETTINGS,
        backend,
        resources: {
          encoderRuns: transcriber.encoderRuns,
          peakTrackedTensorBytes: transcriber.peakTensorBytes,
          liveTensors: transcriber.liveTensors,
          scope:
            "explicitly tracked tensors only; excludes model weights/runtime/browser/driver",
        },
      };
      send({
        type: "result",
        output,
        elapsedMs: performance.now() - started,
      });
    } else {
      await transcriber?.release();
      transcriber = null;
      send({ type: "released" });
    }
  } catch (error) {
    await transcriber?.release();
    transcriber = null;
    send({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof AsrFailure ? { trace: error.trace } : {}),
    });
  } finally {
    clearInterval(timer);
    busy = false;
  }
};
