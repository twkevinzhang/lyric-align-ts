import { inspectOutput } from "./protocol.ts";
import { alignMonotonic } from "./monotonic-alignment.ts";
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
  promptTokens?: number;
  contextTokens?: number;
  output?: unknown;
  analysis?: ReturnType<typeof inspectOutput>;
  lines?: ReturnType<typeof alignMonotonic>;
  wordErrors?: ReturnType<typeof wordErrors>;
  error?: string;
};

export function completeRun(run: Run, output: unknown, elapsedMs: number): Run {
  const analysis = inspectOutput(output, run.secondsTested);
  return {
    ...run,
    output,
    elapsedMs,
    analysis,
    lines: alignMonotonic(analysis.words, run.lyrics, run.secondsTested),
    wordErrors: wordErrors(run.lyrics.join(" "), analysis.text),
  };
}
