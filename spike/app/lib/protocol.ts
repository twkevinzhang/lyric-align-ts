import type { Segment } from "./segment-alignment.ts";
export const MODEL = {
  id: "onnx-community/whisper-small.en_timestamped",
  revision: "8085393831131554ad978a4e438295a734d3d2c0",
} as const;
export const SETTINGS = {
  runtime: "4.3.1",
  device: "webgpu",
  dtype: "q4",
  chunk_length_s: 30,
  stride_length_s: 5,
  return_timestamps: true,
  max_new_tokens: 128,
  no_repeat_ngram_size: 0,
  do_sample: false,
  promptTextSource: "none",
  timestampCorrection: "none",
  pairing: 1,
  window: 4,
  karaoke: false,
  vad: false,
} as const;
export type Command =
  { type: "load" } | { type: "run"; audio: Float32Array } | { type: "release" };
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
  | { type: "error"; message: string };
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
    text?: unknown;
    chunks?: { text?: unknown; timestamp?: unknown }[];
  };
  if (!raw || !Array.isArray(raw.chunks))
    throw new Error("辨識結果沒有原始段落 chunks；原始結果會保留於報告。");
  const segments = raw.chunks.map((c) => {
    if (
      !c ||
      typeof c.text !== "string" ||
      !Array.isArray(c.timestamp) ||
      c.timestamp.length !== 2
    )
      throw new Error("無效的 ASR 段落");
    const t = c.timestamp;
    return {
      text: typeof c.text === "string" ? c.text : "",
      start: typeof t[0] === "number" && Number.isFinite(t[0]) ? t[0] : null,
      end: typeof t[1] === "number" && Number.isFinite(t[1]) ? t[1] : null,
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
