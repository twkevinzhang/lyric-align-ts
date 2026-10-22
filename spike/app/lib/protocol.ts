import type { Segment } from "./segment-alignment.ts";
export const MODEL = {
  id: "onnx-community/whisper-small.en_timestamped",
  revision: "8085393831131554ad978a4e438295a734d3d2c0",
} as const;
export const SETTINGS = {
  runtime: "4.3.1",
  engine: "upstream-port-v1",
  dtype: "q4",
  max_length: 448,
  beam_size: 5,
  best_of: 5,
  patience: 1,
  length_penalty: 1,
  temperatures: [0, 0.2, 0.4, 0.6, 0.8, 1],
  compression_ratio_threshold: 2.4,
  log_prob_threshold: -1,
  no_speech_threshold: 0.6,
  condition_on_previous_text: true,
  prompt_reset_on_temperature: 0.5,
  word_timestamps: true,
  no_repeat_ngram_size: 0,
  repetition_penalty: 1,
  suppress_blank: true,
  max_initial_timestamp: 1,
  initial_prompt: null,
  prefix: null,
  hotwords: null,
  hallucination_silence_threshold: null,
  samplingRng: "Math.random",
  promptTextSource: "none",
  timestampCorrection: "none",
  pairing: "auto",
  window: 4,
  karaoke: false,
  vad: false,
} as const;
export type Command =
  | { type: "load"; backend: "wasm" | "webgpu" }
  | { type: "run"; audio: Float32Array }
  | { type: "release" };
export type WorkerEvent =
  | { type: "progress"; data: unknown }
  | { type: "ready"; elapsedMs: number }
  | { type: "tick"; elapsedMs: number; jsHeapBytes: number | null }
  | {
      type: "result";
      output: unknown;
      elapsedMs: number;
    }
  | { type: "released" }
  | { type: "status"; message: string }
  | { type: "trace"; trace: unknown }
  | { type: "error"; message: string; trace?: unknown };
export type Anomaly = { index: number; kind: string };
export type HeapSample = {
  elapsedMs: number;
  stage: string;
  bytes: number | null;
  source: "main-js-heap" | "worker-js-heap";
};

export function jsHeap(): number | null {
  return (
    (performance as Performance & { memory?: { usedJSHeapSize: number } })
      .memory?.usedJSHeapSize ?? null
  );
}

export function inspectOutput(
  output: unknown,
  duration: number,
): { segments: Segment[]; anomalies: Anomaly[]; text: string } {
  const raw = output as {
    engine?: unknown;
    trace?: unknown;
    text?: unknown;
    segments?: {
      text?: unknown;
      start?: unknown;
      end?: unknown;
      words?: unknown;
    }[];
  };
  if (
    !raw ||
    raw.engine !== SETTINGS.engine ||
    !Array.isArray(raw.segments) ||
    !Array.isArray(raw.trace)
  )
    throw new Error("辨識結果不屬於自訂 ASR 流程；需包含 segments 與 trace。");
  const segments = raw.segments.map((c) => {
    if (!c || typeof c.text !== "string") throw new Error("無效的 ASR 段落");
    const words = c.words;
    if (
      words !== undefined &&
      (!Array.isArray(words) ||
        words.some(
          (w) =>
            !w ||
            typeof w.word !== "string" ||
            !Number.isFinite(w.start) ||
            !Number.isFinite(w.end),
        ))
    )
      throw Error("無效的 ASR 詞時間");
    return {
      text: typeof c.text === "string" ? c.text : "",
      start:
        typeof c.start === "number" && Number.isFinite(c.start)
          ? c.start
          : null,
      end: typeof c.end === "number" && Number.isFinite(c.end) ? c.end : null,
      words: words as Segment["words"],
    };
  });
  const anomalies: Anomaly[] = [];
  for (let i = 0; i < segments.length; i++) {
    const w = segments[i];
    if (w.start === null || w.end === null) {
      anomalies.push({ index: i, kind: "缺少時間" });
      continue;
    }
    if (w.start < 0 || w.end > duration + 0.1)
      anomalies.push({ index: i, kind: "超出音檔範圍" });
    if (w.end <= w.start) anomalies.push({ index: i, kind: "零長度或負長度" });
    const prev = segments[i - 1];
    if (
      prev?.start !== null &&
      prev?.start !== undefined &&
      w.start < prev.start
    )
      anomalies.push({ index: i, kind: "起點倒序" });
    if (
      prev?.end !== null &&
      prev?.end !== undefined &&
      w.start < prev.end - 0.001
    )
      anomalies.push({ index: i, kind: "時間重疊（需人工核對）" });
    if (
      prev &&
      prev.text.trim() === w.text.trim() &&
      prev.start === w.start &&
      prev.end === w.end
    )
      anomalies.push({ index: i, kind: "相鄰重複段落與時間" });
  }
  return {
    segments,
    anomalies,
    text: typeof raw.text === "string" ? raw.text : "",
  };
}
