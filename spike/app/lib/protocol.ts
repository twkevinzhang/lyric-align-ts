export const MODELS = {
  ctc: {
    id: "onnx-community/wav2vec2-base-960h-ONNX",
    revision: "729c1a6730fb549c20a1c73a3d3f96f11020225e",
  },
  baseEn: {
    id: "onnx-community/whisper-base.en_timestamped",
    revision: "fa239a41836c3305f6beec180e5940f3823ff5b8",
  },
  smallEn: {
    id: "onnx-community/whisper-small.en_timestamped",
    revision: "8085393831131554ad978a4e438295a734d3d2c0",
  },
  small: {
    id: "onnx-community/whisper-small_timestamped",
    revision: "65caa70f294b46e1c33ff820aae6b16d048ab818",
  },
  tiny: {
    id: "onnx-community/whisper-tiny_timestamped",
    revision: "517244293732ee2d58139af5814231b7e6830a0d",
  },
  base: {
    id: "onnx-community/whisper-base_timestamped",
    revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e",
  },
} as const;
export type ModelKey = keyof typeof MODELS;
export const SETTINGS = {
  runtime: "4.3.1",
  device: "webgpu",
  dtype: "q4",
  language: "en",
  task: "transcribe",
  chunk_length_s: 30,
  stride_length_s: 5,
  return_timestamps: "word",
} as const;
export type Command =
  | { type: "load"; model: ModelKey }
  | { type: "run"; audio: Float32Array }
  | { type: "ctc-experiment"; audio: Float32Array; lyrics: string }
  | {
      type: "experiment-suite";
      audio: Float32Array;
      candidateOnly?: boolean;
      correctTimestamps?: boolean;
      lyricPrompt?: boolean;
      lyrics?: string;
    }
  | { type: "text-control"; audio: Float32Array; nativeTimestamps: boolean }
  | { type: "release" };
export type WorkerEvent =
  | { type: "progress"; data: unknown }
  | { type: "ready"; elapsedMs: number; model: ModelKey }
  | { type: "tick"; elapsedMs: number; jsHeapBytes: number | null }
  | { type: "chunk"; data: unknown }
  | { type: "result"; output: unknown; elapsedMs: number }
  | {
      type: "experiment-result";
      id: string;
      settings: unknown;
      output: unknown;
      elapsedMs: number;
    }
  | { type: "experiment-complete" }
  | { type: "text-control-result"; output: unknown; elapsedMs: number }
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
