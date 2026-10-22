import { alignSegments } from "../segment-alignment.ts";
import { failure, libraryError } from "./errors.ts";
import type {
  AlignedLine,
  AudioInput,
  ErrorCode,
  LyricAlignSession,
  OperationContext,
  Progress,
  Segment,
} from "./contract.ts";

type Runtime = {
  load(
    device: "wasm" | "webgpu",
    progress: (data: unknown) => void,
  ): Promise<void>;
  release(): Promise<void>;
};
type Infer<R> = (
  runtime: R,
  audio: Float32Array,
  status: (detail: string) => void,
) => Promise<readonly Segment[]>;
const check = (condition: unknown, message: string) => {
  if (!condition) throw failure("INVALID_INPUT", message);
};
function language(value?: string) {
  if (value !== undefined && value !== "en")
    throw failure(
      "UNSUPPORTED_LANGUAGE",
      "This fixed small.en model supports en only.",
    );
}
function keys(value: object, allowed: string[]) {
  check(
    value && typeof value === "object" && !Array.isArray(value),
    "options must be an object",
  );
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      throw failure("UNSUPPORTED_OPTION", `Unsupported option: ${key}`);
}
function timing(start: number, end: number) {
  return (
    Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start
  );
}
function validateSegments(segments: readonly Segment[]) {
  check(Array.isArray(segments), "segments must be an array");
  for (const segment of segments) {
    check(
      segment &&
        typeof segment.text === "string" &&
        timing(segment.start, segment.end),
      "Invalid segment",
    );
    if (segment.words !== undefined) {
      check(Array.isArray(segment.words), "Invalid words");
      for (const word of segment.words)
        check(
          word &&
            typeof word.word === "string" &&
            Number.isFinite(word.start) &&
            Number.isFinite(word.end) &&
            word.start >= 0 &&
            word.end >= word.start,
          "Invalid word",
        );
    }
  }
}

/** Worker-side core. Model construction and inference are injected at the runtime boundary. */
export function createCore<R extends Runtime>(
  device: "wasm" | "webgpu",
  makeRuntime: () => R,
  infer: Infer<R>,
): LyricAlignSession {
  let runtime: R | undefined,
    ready = false,
    disposed = false;
  let active: Promise<unknown> | undefined;
  let disposing: Promise<void> | undefined;
  function run<T>(
    phase: Progress["phase"],
    code: ErrorCode,
    context: OperationContext,
    work: (
      emit: (
        progress:
          | Omit<Extract<Progress, { kind: "measured" }>, "phase" | "sequence">
          | { kind: "indeterminate"; detail?: string },
      ) => void,
    ) => Promise<T>,
  ): Promise<T> {
    if (disposed || active)
      return Promise.reject(
        failure(
          "INVALID_INPUT",
          disposed ? "Session disposed" : "Session already busy",
        ),
      );
    let sequence = 0;
    const task = Promise.resolve()
      .then(async () => {
        if (context.signal.aborted)
          throw failure("ABORTED", "Operation aborted");
        const emit = (
          event:
            | Omit<
                Extract<Progress, { kind: "measured" }>,
                "phase" | "sequence"
              >
            | { kind: "indeterminate"; detail?: string },
        ) =>
          context.onProgress?.({
            ...event,
            phase,
            sequence: ++sequence,
          } as Progress);
        emit({ kind: "indeterminate" });
        const result = await work(emit);
        if (context.signal.aborted)
          throw failure("ABORTED", "Operation aborted");
        return result;
      })
      .catch((error) => {
        throw libraryError(error, code);
      });
    active = task;
    void task
      .finally(() => {
        if (active === task) active = undefined;
      })
      .catch(() => {});
    return task;
  }
  return {
    prepare(options, context) {
      return run(
        "preparing-model",
        "MODEL_LOAD_FAILED",
        context,
        async (emit) => {
          keys(options, ["language"]);
          language(options.language);
          if (ready) return;
          runtime = makeRuntime();
          try {
            await runtime.load(device, (data) => {
              const p = data as Record<string, unknown> | null;
              if (
                p &&
                p.status === "progress" &&
                typeof p.loaded === "number" &&
                typeof p.total === "number" &&
                Number.isFinite(p.loaded) &&
                Number.isFinite(p.total) &&
                p.loaded >= 0 &&
                p.total > 0 &&
                p.loaded <= p.total &&
                typeof p.file === "string"
              )
                emit({
                  kind: "measured",
                  completed: p.loaded,
                  total: p.total,
                  unit: "bytes",
                  scope: p.file,
                });
              else emit({ kind: "indeterminate" });
            });
            ready = true;
          } catch (error) {
            await runtime.release();
            runtime = undefined;
            throw error;
          }
        },
      );
    },
    transcribe(audio: AudioInput, options, context) {
      return run(
        "transcribing",
        "TRANSCRIPTION_FAILED",
        context,
        async (emit) => {
          keys(options, ["language", "lyricsContext"]);
          language(options.language);
          if (options.lyricsContext !== undefined)
            throw failure(
              "UNSUPPORTED_OPTION",
              "lyricsContext is not supported by this model",
            );
          check(ready && runtime, "Call prepare first");
          check(
            audio &&
              audio.sampleRate === 16000 &&
              audio.pcm instanceof Float32Array &&
              audio.pcm.length > 0 &&
              audio.pcm.every(Number.isFinite),
            "Expected complete finite mono 16kHz PCM",
          );
          const segments = await infer(runtime!, audio.pcm, (detail) =>
            emit({ kind: "indeterminate", detail }),
          );
          validateSegments(segments);
          return segments;
        },
      );
    },
    align(segments, lyrics, options, context) {
      return run("aligning", "ALIGNMENT_FAILED", context, async (emit) => {
        keys(options, ["pairing", "threshold", "window", "karaoke"]);
        if (options.karaoke !== undefined && options.karaoke !== false)
          throw failure(
            "UNSUPPORTED_OPTION",
            "Only karaoke=false is supported",
          );
        check(ready, "Call prepare first");
        check(
          options.pairing === undefined ||
            options.pairing === "auto" ||
            (Number.isSafeInteger(options.pairing) &&
              Number(options.pairing) >= 1),
          "pairing must be auto or a positive integer",
        );
        check(
          options.window === undefined ||
            (Number.isSafeInteger(options.window) && options.window > 0),
          "window must be a positive integer",
        );
        check(
          options.threshold === undefined ||
            (Number.isFinite(options.threshold) &&
              options.threshold >= 0 &&
              options.threshold <= 1),
          "threshold must be between 0 and 1",
        );
        validateSegments(segments);
        check(
          Array.isArray(lyrics) &&
            lyrics.length > 0 &&
            lyrics.every(
              (line) => typeof line === "string" && line.trim().length > 0,
            ),
          "lyrics must contain nonblank strings",
        );
        const result: AlignedLine[] = alignSegments(
          segments.map((s) => ({
            ...s,
            words: s.words?.map((w) => ({ ...w })),
          })),
          [...lyrics],
          options.pairing,
          options,
        ).map(({ line, start, end, score, matched }) => ({
          line,
          start,
          end,
          score,
          matched,
        }));
        emit({
          kind: "measured",
          completed: result.length,
          total: lyrics.length,
          unit: "items",
          scope: "lyrics",
        });
        return result;
      });
    },
    dispose() {
      if (!disposing) {
        disposed = true;
        disposing = (async () => {
          await active?.catch(() => {});
          const current = runtime;
          runtime = undefined;
          ready = false;
          await current?.release();
        })();
      }
      return disposing;
    },
  };
}
