import { inspectOutput } from "./protocol.ts";
import { alignSegments } from "./segment-alignment.ts";
import { wordErrors } from "./word-errors.ts";

export type AudioInfo = {
  name: string;
  duration: number;
  sampleRate: number;
  samples: number;
  sha256: string;
  decodeMs: number;
};
export type Run = {
  startedAt: string;
  audio: AudioInfo;
  lyrics: string[];
  secondsTested: number;
  elapsedMs?: number;
  output?: unknown;
  analysis?: ReturnType<typeof inspectOutput>;
  lines?: ReturnType<typeof alignSegments>;
  wordErrors?: ReturnType<typeof wordErrors>;
  error?: string;
  backend: "wasm" | "webgpu";
  trace?: unknown;
};

export function completeRun(run: Run, output: unknown, elapsedMs: number): Run {
  const analysis = inspectOutput(output, run.secondsTested);
  return {
    ...run,
    output,
    elapsedMs,
    analysis,
    lines: alignSegments(analysis.segments, run.lyrics, "auto"),
    wordErrors: wordErrors(run.lyrics.join(" "), analysis.text),
  };
}
