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
  return_timestamps: "word",
  max_new_tokens: 128,
  no_repeat_ngram_size: 0,
  do_sample: false,
  promptTextSource: "provided-lyrics",
  timestampCorrection: "none",
} as const;
export function preparePrompt(
  context: number[],
  previous: number,
  initial: number[],
): number[] {
  if (!context.length) throw new Error("歌詞提示不可為空。");
  return [previous, ...context.slice(-224), ...initial];
}
export type Command =
  | { type: "load" }
  | { type: "run"; audio: Float32Array; lyrics: string[] }
  | { type: "release" };
export type WorkerEvent =
  | { type: "progress"; data: unknown }
  | { type: "ready"; elapsedMs: number }
  | { type: "tick"; elapsedMs: number; jsHeapBytes: number | null }
  | {
      type: "result";
      output: unknown;
      elapsedMs: number;
      promptTokens: number;
      contextTokens: number;
    }
  | { type: "released" }
  | { type: "error"; message: string };
export type TimedWord = {
  text: string;
  start: number | null;
  end: number | null;
};
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
): { words: TimedWord[]; anomalies: Anomaly[]; text: string } {
  const raw = output as {
    text?: unknown;
    chunks?: { text?: unknown; timestamp?: unknown }[];
  };
  if (!raw || !Array.isArray(raw.chunks))
    throw new Error("辨識結果沒有詞級 chunks；原始結果會保留於報告。");
  const words = raw.chunks.map((c) => {
    const t = Array.isArray(c.timestamp) ? c.timestamp : [];
    return {
      text: typeof c.text === "string" ? c.text : "",
      start: typeof t[0] === "number" && Number.isFinite(t[0]) ? t[0] : null,
      end: typeof t[1] === "number" && Number.isFinite(t[1]) ? t[1] : null,
    };
  });
  const anomalies: Anomaly[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.start === null || w.end === null) {
      anomalies.push({ index: i, kind: "缺少時間" });
      continue;
    }
    if (w.start < 0 || w.end > duration + 0.1)
      anomalies.push({ index: i, kind: "超出音檔範圍" });
    if (w.end <= w.start) anomalies.push({ index: i, kind: "零長度或負長度" });
    const prev = words[i - 1];
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
      anomalies.push({ index: i, kind: "相鄰重複詞與時間" });
  }
  return {
    words,
    anomalies,
    text: typeof raw.text === "string" ? raw.text : "",
  };
}
