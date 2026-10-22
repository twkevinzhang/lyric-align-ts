import { failure, libraryError } from "./errors.ts";
import type {
  ErrorCode,
  LyricAlignSession,
  OperationContext,
  Progress,
} from "./contract.ts";

export interface WorkerPort {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}
export function workerSession(
  worker: WorkerPort,
  device: "wasm" | "webgpu",
): LyricAlignSession {
  let nextId = 0,
    closed = false,
    terminated = false,
    disposal: Promise<void> | undefined;
  let pending:
    | {
        id: number;
        code: ErrorCode;
        context?: OperationContext;
        resolve: (value: unknown) => void;
        reject: (error: unknown) => void;
        cleanup: () => void;
      }
    | undefined;
  const terminate = () => {
    if (!terminated) {
      terminated = true;
      worker.terminate();
    }
  };
  const settle = (error: unknown, result?: unknown) => {
    const current = pending;
    if (!current) return;
    pending = undefined;
    current.cleanup();
    if (error) current.reject(libraryError(error, current.code));
    else current.resolve(result);
  };
  const crash = (message: string) => {
    closed = true;
    terminate();
    settle(failure(pending?.code ?? "INVALID_INPUT", message));
  };
  worker.onerror = (event) => {
    event.preventDefault();
    crash(event.message || "Worker crashed");
  };
  worker.onmessageerror = () =>
    crash("Worker response could not be deserialized");
  worker.onmessage = ({
    data,
  }: MessageEvent<{
    id: number;
    progress?: Progress;
    error?: unknown;
    result?: unknown;
  }>) => {
    if (!pending || data.id !== pending.id) return;
    if (data.progress) {
      // An observer must not prevent completion or leak a worker.
      try {
        pending.context?.onProgress?.(data.progress);
      } catch {
        /* observer only */
      }
    } else settle(data.error, data.result);
  };
  function request<T>(
    method: keyof LyricAlignSession,
    args: unknown[],
    code: ErrorCode,
    context?: OperationContext,
  ): Promise<T> {
    if (closed || pending)
      return Promise.reject(
        failure(
          "INVALID_INPUT",
          closed ? "Session disposed or terminated" : "Session already busy",
        ),
      );
    if (context?.signal.aborted)
      return Promise.reject(failure("ABORTED", "Operation aborted"));
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        closed = true;
        terminate();
        settle(
          failure("ABORTED", "Operation aborted; session worker terminated"),
        );
      };
      pending = {
        id: ++nextId,
        code,
        context,
        resolve: (value) => resolve(value as T),
        reject,
        cleanup: () => context?.signal.removeEventListener("abort", abort),
      };
      context?.signal.addEventListener("abort", abort, { once: true });
      try {
        worker.postMessage({ id: nextId, method, args, device });
      } catch (error) {
        closed = true;
        terminate();
        settle(error);
      }
    });
  }
  return {
    prepare: (options, context) =>
      request("prepare", [options], "MODEL_LOAD_FAILED", context),
    transcribe: (audio, options, context) =>
      request("transcribe", [audio, options], "TRANSCRIPTION_FAILED", context),
    align: (segments, lyrics, options, context) =>
      request(
        "align",
        [segments, lyrics, options],
        "ALIGNMENT_FAILED",
        context,
      ),
    dispose() {
      if (!disposal) {
        if (pending)
          return Promise.reject(
            failure(
              "INVALID_INPUT",
              "Wait for active operation before dispose",
            ),
          );
        disposal = closed
          ? Promise.resolve()
          : request<void>("dispose", [], "INVALID_INPUT");
        closed = true;
        disposal = disposal.finally(terminate);
      }
      return disposal;
    },
  };
}
