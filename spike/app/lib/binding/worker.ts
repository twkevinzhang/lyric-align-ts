import { WhisperRuntime } from "../asr/runtime.ts";
import { transcribe } from "../asr/transcribe.ts";
import { createCore } from "./core.ts";
import { libraryError } from "./errors.ts";
import type { LyricAlignSession } from "./contract.ts";

let session: LyricAlignSession | undefined;
self.onmessage = async ({
  data,
}: MessageEvent<{
  id: number;
  method: keyof LyricAlignSession;
  args: unknown[];
  device: "wasm" | "webgpu";
}>) => {
  const { id, method, args, device } = data;
  try {
    session ??= createCore(
      device,
      () => new WhisperRuntime(),
      async (runtime, audio, status) => {
        runtime.resetRunMetrics();
        return (await transcribe(runtime, audio, status)).segments;
      },
    );
    const context = {
      signal: new AbortController().signal,
      onProgress: (progress: unknown) => self.postMessage({ id, progress }),
    };
    let result: unknown;
    switch (method) {
      case "prepare":
        result = await session.prepare(
          args[0] as Parameters<LyricAlignSession["prepare"]>[0],
          context,
        );
        break;
      case "transcribe":
        result = await session.transcribe(
          args[0] as Parameters<LyricAlignSession["transcribe"]>[0],
          args[1] as Parameters<LyricAlignSession["transcribe"]>[1],
          context,
        );
        break;
      case "align":
        result = await session.align(
          args[0] as Parameters<LyricAlignSession["align"]>[0],
          args[1] as Parameters<LyricAlignSession["align"]>[1],
          args[2] as Parameters<LyricAlignSession["align"]>[2],
          context,
        );
        break;
      case "dispose":
        result = await session.dispose();
        break;
    }
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({
      id,
      error: libraryError(
        error,
        method === "prepare"
          ? "MODEL_LOAD_FAILED"
          : method === "transcribe"
            ? "TRANSCRIPTION_FAILED"
            : "ALIGNMENT_FAILED",
      ),
    });
  }
};
