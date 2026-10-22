import { useEffect, useRef, useState } from "react";
import {
  MODELS,
  SETTINGS,
  inspectOutput,
  jsHeap,
  type Command,
  type HeapSample,
  type ModelKey,
  type WorkerEvent,
} from "../lib/protocol";
import { align, groupWords, parseLyrics } from "../lib/alignment";
import { nativeSegments } from "../lib/native-segments";
import { alignMonotonic } from "../lib/monotonic-alignment";
import {
  scoreLineStarts,
  referenceApplies,
  type LineReference,
} from "../lib/reference";

type HumanReference = {
  audioSha256: string;
  lyrics: string[];
  references: LineReference[];
  source: string;
  note: string;
};

type AudioInfo = {
  name: string;
  duration: number;
  sampleRate: number;
  samples: number;
  sha256: string;
  decodeMs: number;
};
type Run = {
  lyrics?: string[];
  experimentId?: string;
  settings?: unknown;
  nativeTimestamps?: boolean;
  startedAt: string;
  model: ModelKey;
  audio: AudioInfo;
  secondsTested: number;
  elapsedMs?: number;
  output?: unknown;
  analysis?: ReturnType<typeof inspectOutput>;
  error?: string;
  windows: unknown[];
};
const seconds = (n: number | null | undefined) =>
  n == null ? "—" : n.toFixed(2);
const mb = (n: number | null) =>
  n === null ? "無法取得" : `${(n / 1048576).toFixed(1)} MiB`;

async function decodeAudio(bytes: ArrayBuffer, name: string) {
  const started = performance.now();
  const context = new AudioContext({ sampleRate: 16000 });
  try {
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const buffer = await context.decodeAudioData(bytes);
    if (buffer.sampleRate !== 16000)
      throw new Error(`預期 16000 Hz，實際 ${buffer.sampleRate} Hz。`);
    const mono = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < mono.length; i++)
        mono[i] += channel[i] / buffer.numberOfChannels;
    }
    return {
      mono,
      info: {
        name,
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        samples: mono.length,
        sha256: Array.from(new Uint8Array(hash), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
        decodeMs: performance.now() - started,
      },
    };
  } finally {
    await context.close();
  }
}
function saveReport(report: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `lyric-spike-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Spike() {
  const [model, setModel] = useState<ModelKey>("tiny");
  const [loaded, setLoaded] = useState<ModelKey | null>(null);
  const [phase, setPhase] = useState("尚未載入");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [device, setDevice] = useState<Record<string, unknown>>({
    status: "檢查中",
  });
  const [audio, setAudio] = useState<AudioInfo | null>(null);
  const [limit, setLimit] = useState("0");
  const [lyrics, setLyrics] = useState("");
  const [reference, setReference] = useState<HumanReference | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [textControls, setTextControls] = useState<Run[]>([]);
  const [experimentRuns, setExperimentRuns] = useState<Run[]>([]);
  const suiteContext = useRef<Run | null>(null);
  const control = useRef<Run | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [heap, setHeap] = useState<number | null>(null);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const worker = useRef<Worker | null>(null);
  const pcm = useRef<Float32Array | null>(null);
  const current = useRef<Run | null>(null);
  const samples = useRef<HeapSample[]>([]);
  const sessionStart = useRef(0);
  const stage = useRef("idle");
  const loadMs = useRef<Record<string, number>>({});
  const errorLog = useRef<{ at: string; message: string }[]>([]);

  function fail(message: string) {
    setError(message);
    setBusy(false);
    setPhase("操作失敗");
    stage.current = "error";
    errorLog.current.push({ at: new Date().toISOString(), message });
    if (current.current) {
      current.current.error = message;
      setRuns((prev) => [...prev, current.current!]);
      current.current = null;
    }
    if (control.current) {
      const failed = { ...control.current, error: message };
      setTextControls((prev) => [...prev, failed]);
      control.current = null;
    }
    suiteContext.current = null;
  }
  useEffect(() => {
    sessionStart.current = performance.now();
    const timer = setInterval(() => {
      const bytes = jsHeap();
      setHeap(bytes);
      samples.current.push({
        elapsedMs: performance.now() - sessionStart.current,
        stage: stage.current,
        bytes,
        source: "main-js-heap",
      });
    }, 1000);
    void (async () => {
      try {
        if (!navigator.gpu) throw new Error("此 Chrome 未提供 WebGPU。");
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("找不到可用的 GPU adapter。");
        setDevice({
          status: "WebGPU 可用",
          vendor: adapter.info.vendor,
          architecture: adapter.info.architecture,
          description: adapter.info.description,
          shaderF16: adapter.features.has("shader-f16"),
          maxBufferSize: adapter.limits.maxBufferSize,
          maxStorageBufferBindingSize:
            adapter.limits.maxStorageBufferBindingSize,
          userAgent: navigator.userAgent,
          crossOriginIsolated,
        });
      } catch (e) {
        setDevice({ status: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      clearInterval(timer);
      worker.current?.terminate();
    };
  }, []);

  function getWorker(): Worker {
    if (worker.current) return worker.current;
    const instance = new Worker(new URL("../asr.worker.ts", import.meta.url), {
      type: "module",
    });
    instance.onerror = (e) => fail(e.message);
    instance.onmessage = ({ data }: MessageEvent<WorkerEvent>) => {
      if (data.type === "progress") {
        const p = data.data as {
          file?: string;
          progress?: number;
          status?: string;
        };
        if (p.file)
          setProgress((prev) => ({
            ...prev,
            [p.file!]:
              p.progress == null
                ? (p.status ?? "")
                : `${p.progress.toFixed(1)}%`,
          }));
      } else if (data.type === "ready") {
        loadMs.current[data.model] = data.elapsedMs;
        setLoaded(data.model);
        setPhase("模型就緒");
        setBusy(false);
        stage.current = "ready";
      } else if (data.type === "tick") {
        setElapsed(data.elapsedMs);
        samples.current.push({
          elapsedMs: performance.now() - sessionStart.current,
          stage: "inference",
          bytes: data.jsHeapBytes,
          source: "worker-js-heap",
        });
      } else if (data.type === "chunk") {
        current.current?.windows.push(data.data);
      } else if (data.type === "result") {
        const run = current.current;
        if (!run) return;
        run.output = data.output;
        run.elapsedMs = data.elapsedMs;
        try {
          run.analysis = inspectOutput(data.output, run.secondsTested);
        } catch (e) {
          run.error = String(e);
        }
        setRuns((prev) => [...prev, run]);
        current.current = null;
        setElapsed(data.elapsedMs);
        setBusy(false);
        setPhase("辨識完成");
        stage.current = "complete";
      } else if (data.type === "experiment-result") {
        if (!suiteContext.current) return;
        const result = {
          ...suiteContext.current,
          experimentId: data.id,
          settings: data.settings,
          output: data.output,
          elapsedMs: data.elapsedMs,
          analysis: inspectOutput(
            data.output,
            suiteContext.current.secondsTested,
          ),
        };
        setExperimentRuns((prev) => [...prev, result]);
        setPhase(`改善對照組：${data.id} 完成`);
      } else if (data.type === "experiment-complete") {
        suiteContext.current = null;
        setBusy(false);
        setPhase("改善對照組完成");
        stage.current = "complete";
      } else if (data.type === "text-control-result") {
        if (control.current) {
          const completed = {
            ...control.current,
            output: data.output,
            elapsedMs: data.elapsedMs,
          };
          setTextControls((prev) => [...prev, completed]);
          control.current = null;
        }
        setElapsed(data.elapsedMs);
        setBusy(false);
        setPhase("辨識模式控制組完成");
        stage.current = "complete";
      } else if (data.type === "released") {
        setLoaded(null);
        setBusy(false);
        setPhase("已呼叫 dispose；GPU 記憶體需另行觀察");
        stage.current = "disposed";
        instance.terminate();
        worker.current = null;
      } else fail(data.message);
    };
    worker.current = instance;
    return instance;
  }
  function send(command: Command) {
    getWorker().postMessage(command);
  }
  async function decode(bytes: ArrayBuffer, name: string) {
    setBusy(true);
    setError("");
    setPhase("解碼音訊");
    stage.current = "decode";
    try {
      const decoded = await decodeAudio(bytes, name);
      pcm.current = decoded.mono;
      setAudio(decoded.info);
      setPhase("音訊就緒");
      stage.current = "audio-ready";
    } finally {
      setBusy(false);
    }
  }
  async function loadLocal() {
    setBusy(true);
    setError("");
    try {
      const [file, text, refFile] = await Promise.all([
        fetch("/__local/amazing-grace.m4a"),
        fetch("/__local/amazing-grace.txt"),
        fetch("/__local/reference.json"),
      ]);
      if (!file.ok) throw new Error("本機素材不存在，請使用音檔選擇器。");
      if (text.ok) setLyrics(await text.text());
      setReference(
        refFile.ok ? ((await refFile.json()) as HumanReference) : null,
      );
      await decode(await file.arrayBuffer(), "amazing_grace.m4a");
    } catch (e) {
      fail(String(e));
    }
  }
  function loadModel() {
    setError("");
    setProgress({});
    setBusy(true);
    setPhase("載入 q4 模型");
    stage.current = "model-load";
    send({ type: "load", model });
  }
  function run() {
    if (!pcm.current || !audio || !loaded) return;
    setError("");
    setBusy(true);
    setElapsed(0);
    setPhase("辨識中");
    stage.current = "inference";
    const duration =
      Number(limit) > 0
        ? Math.min(Number(limit), audio.duration)
        : audio.duration;
    const copy = pcm.current.slice(0, Math.round(duration * 16000));
    current.current = {
      startedAt: new Date().toISOString(),
      model: loaded,
      audio,
      secondsTested: duration,
      windows: [],
    };
    getWorker().postMessage({ type: "run", audio: copy } satisfies Command, [
      copy.buffer,
    ]);
  }
  function release() {
    setBusy(true);
    setPhase("釋放模型");
    stage.current = "dispose";
    send({ type: "release" });
  }
  function runTextControl(nativeTimestamps = false) {
    if (!pcm.current || !audio || !loaded) return;
    setError("");
    setBusy(true);
    setElapsed(0);
    setPhase(
      nativeTimestamps ? "原生段落控制組辨識中" : "無時間戳控制組辨識中",
    );
    stage.current = "text-control";
    const duration =
      Number(limit) > 0
        ? Math.min(Number(limit), audio.duration)
        : audio.duration;
    const copy = pcm.current.slice(0, Math.round(duration * 16000));
    control.current = {
      nativeTimestamps,
      startedAt: new Date().toISOString(),
      model: loaded,
      audio,
      secondsTested: duration,
      windows: [],
    };
    getWorker().postMessage(
      { type: "text-control", audio: copy, nativeTimestamps } satisfies Command,
      [copy.buffer],
    );
  }
  function runExperiments(
    candidateOnly = false,
    correctTimestamps = false,
    lyricPrompt = false,
  ) {
    if (!pcm.current || !audio || !loaded) return;
    setError("");
    setBusy(true);
    setElapsed(0);
    setPhase("改善對照組辨識中");
    stage.current = "experiment-suite";
    const duration =
      Number(limit) > 0
        ? Math.min(Number(limit), audio.duration)
        : audio.duration;
    const copy = pcm.current.slice(0, Math.round(duration * 16000));
    suiteContext.current = {
      startedAt: new Date().toISOString(),
      model: loaded,
      audio,
      secondsTested: duration,
      windows: [],
      lyrics: parseLyrics(lyrics),
    };
    getWorker().postMessage(
      {
        type: "experiment-suite",
        audio: copy,
        candidateOnly,
        correctTimestamps,
        lyricPrompt,
        lyrics: lyricPrompt ? lyrics : undefined,
      } satisfies Command,
      [copy.buffer],
    );
  }
  function stop() {
    worker.current?.terminate();
    worker.current = null;
    setLoaded(null);
    fail("使用者中止 worker；不保證 GPU driver 已回收全部資源。");
  }
  function runCtc() {
    if (
      !pcm.current ||
      !audio ||
      loaded !== "ctc" ||
      !lyrics.trim() ||
      limit !== "0"
    )
      return;
    setError("");
    setBusy(true);
    setElapsed(0);
    setPhase("CTC 歌詞強制對齊中");
    stage.current = "ctc-experiment";
    const copy = pcm.current.slice();
    suiteContext.current = {
      startedAt: new Date().toISOString(),
      model: loaded,
      audio,
      secondsTested: audio.duration,
      windows: [],
      lyrics: parseLyrics(lyrics),
    };
    getWorker().postMessage(
      { type: "ctc-experiment", audio: copy, lyrics } satisfies Command,
      [copy.buffer],
    );
  }
  const latest = runs.at(-1);
  const lines = parseLyrics(lyrics);
  const segments = latest?.analysis ? groupWords(latest.analysis.words) : [];
  const aligned = lines.length ? align(segments, lines) : [];
  const nativeChunks = (
    latest?.output as { native_chunks?: unknown } | undefined
  )?.native_chunks;
  const nativeInfo =
    Array.isArray(nativeChunks) && latest?.analysis
      ? nativeSegments(nativeChunks, latest.analysis.words)
      : null;
  const nativeAligned =
    nativeInfo && lines.length ? align(nativeInfo.segments, lines) : null;
  const referenceMatches =
    reference &&
    referenceApplies(
      audio?.sha256,
      latest?.audio.sha256,
      reference.audioSha256,
      lines,
      reference.lyrics,
    );
  const fullSong =
    latest && latest.secondsTested >= latest.audio.duration - 0.05;
  const quality =
    referenceMatches && fullSong && latest?.analysis
      ? scoreLineStarts(aligned, reference.references)
      : null;
  const nativeQuality =
    referenceMatches && fullSong && nativeAligned
      ? scoreLineStarts(nativeAligned, reference.references)
      : null;
  const experimentEvaluations = experimentRuns.map((run) => {
    const applicable =
      reference &&
      run.analysis &&
      run.lyrics &&
      run.secondsTested >= run.audio.duration - 0.05 &&
      referenceApplies(
        audio?.sha256,
        run.audio.sha256,
        reference.audioSha256,
        run.lyrics,
        reference.lyrics,
      );
    if (!applicable || !run.lyrics || !run.analysis || !reference) return null;
    const output = run.output as {
      text_source?: string;
      chunks?: { lineIndex: number; timestamp: [number, number] }[];
    };
    const forced = output.text_source === "provided-lyrics-not-recognized";
    const mapped = forced
      ? run.lyrics.map((line, lineIndex) => ({
          line,
          matched: true,
          start:
            output.chunks?.find((c) => c.lineIndex === lineIndex)
              ?.timestamp[0] ?? null,
        }))
      : alignMonotonic(run.analysis.words, run.lyrics);
    return {
      id: run.experimentId,
      model: run.model,
      source: forced ? "提供歌詞（強制指派）" : "辨識文字（順序配對）",
      lines: mapped,
      metrics: scoreLineStarts(mapped, reference.references),
    };
  });
  function exportReport() {
    const report = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      settings: SETTINGS,
      models: MODELS,
      device,
      audio,
      modelLoadMs: loadMs.current,
      runs,
      experimentRuns,
      experimentEvaluations,
      textControls: textControls.map((r) => ({
        ...r,
        settings: {
          ...SETTINGS,
          return_timestamps: r.nativeTimestamps ?? false,
          return_token_timestamps: false,
        },
      })),
      memorySamples: samples.current,
      errors: errorLog.current,
      alignment: {
        adapter:
          "experimental: pause >=0.65s or span >14s; not native Whisper segments",
        pairing: "auto",
        lyrics,
        segments,
        lines: aligned,
      },
      nativeAlignment: nativeInfo
        ? {
            ...nativeInfo,
            lines: nativeAligned,
            dependency:
              "pinned 4.3.1 private tokenizer decode; words associated by start time",
          }
        : null,
      humanReference: referenceMatches ? reference : null,
      referenceQuality: { heuristic: quality, native: nativeQuality },
      limitations: [
        "JS heap is not total RAM or GPU memory.",
        "Upstream runtime risks are accepted; no upstream patches applied.",
        referenceMatches
          ? "Human SRT provides phrase/line starts, not every word onset; one final lyric line is excluded."
          : "No matching human reference loaded: accuracy has not been measured.",
        "Native segment capture uses a private tokenizer API of pinned Transformers.js 4.3.1; model word output is not repaired.",
        "Only the selected audio interval was tested; inspect secondsTested.",
      ],
    };
    saveReport(report);
  }
  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">LOCAL INFERENCE / THROWAWAY SPIKE</p>
          <h1>
            Lyric Align <span>Browser Lab</span>
          </h1>
          <p>
            Chrome · WebGPU · q4。音訊與歌詞在瀏覽器內處理，模型首次使用需下載。
          </p>
        </div>
        <span className="pill">
          {reference ? "人工參考已載入" : "品質尚未評分"}
        </span>
      </header>
      <section className="status" aria-live="polite">
        <strong>{phase}</strong>
        <span>本次辨識 {seconds(elapsed / 1000)} 秒</span>
        <span>主執行緒 JS heap {mb(heap)}</span>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="columns">
        <section className="panel">
          <h2>01 / 測試輸入</h2>
          {import.meta.env.DEV && (
            <button disabled={busy} onClick={() => void loadLocal()}>
              載入本機 Amazing Grace
            </button>
          )}
          <label>
            或選擇本機音檔
            <input
              type="file"
              accept="audio/*"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void file
                    .arrayBuffer()
                    .then((bytes) => decode(bytes, file.name))
                    .catch((e) => fail(String(e)));
              }}
            />
          </label>
          <p>
            {audio
              ? `${audio.name} · ${seconds(audio.duration)} 秒 · ${audio.sampleRate} Hz · 解碼 ${seconds(audio.decodeMs / 1000)} 秒`
              : "尚未選取音檔"}
          </p>
          <label>
            模型
            <select
              value={model}
              disabled={busy || loaded !== null}
              onChange={(e) => setModel(e.target.value as ModelKey)}
            >
              <option value="tiny">Whisper tiny timestamped / q4</option>
              <option value="base">Whisper base timestamped / q4</option>
              <option value="ctc">Wav2Vec2 CTC / q4（強制對齊實驗）</option>
              <option value="baseEn">
                Whisper base.en timestamped / q4（實驗）
              </option>
              <option value="smallEn">
                Whisper small.en timestamped / q4（實驗）
              </option>
              <option value="small">
                Whisper small timestamped / q4（實驗）
              </option>
            </select>
          </label>
          <label>
            測試長度
            <select
              value={limit}
              disabled={busy}
              onChange={(e) => setLimit(e.target.value)}
            >
              <option value="0">整首歌曲</option>
              <option value="30">開頭 30 秒（短片段檢查）</option>
            </select>
          </label>
          <div className="actions">
            <button
              disabled={
                busy ||
                loaded !== "ctc" ||
                audio === null ||
                limit !== "0" ||
                !lyrics.trim()
              }
              onClick={runCtc}
            >
              CTC 歌詞強制對齊（整首／英文）
            </button>
            <button
              disabled={
                busy || loaded !== null || device.status !== "WebGPU 可用"
              }
              onClick={loadModel}
            >
              載入模型
            </button>
            <button
              className="primary"
              disabled={
                busy || loaded === null || loaded === "ctc" || audio === null
              }
              onClick={run}
            >
              開始辨識
            </button>
            <button
              disabled={
                busy || loaded === null || loaded === "ctc" || audio === null
              }
              onClick={() => runExperiments(false)}
            >
              執行五組改善實驗
            </button>
            <button
              disabled={
                busy || loaded === null || loaded === "ctc" || audio === null
              }
              onClick={() => runExperiments(true)}
            >
              單測重複抑制候選
            </button>
            <button
              disabled={
                busy || loaded === null || loaded === "ctc" || audio === null
              }
              onClick={() => runExperiments(true, true)}
            >
              單測詞級時間修正候選
            </button>
            <button
              disabled={
                busy ||
                loaded === null ||
                loaded === "ctc" ||
                audio === null ||
                !lyrics.trim()
              }
              onClick={() => runExperiments(true, false, true)}
            >
              單測歌詞提示候選
            </button>
            <button
              disabled={
                busy ||
                loaded === null ||
                loaded === "ctc" ||
                audio === null ||
                !lyrics.trim()
              }
              onClick={() => runExperiments(true, true, true)}
            >
              單測歌詞提示＋時間修正
            </button>
            <button
              disabled={
                busy || loaded === null || loaded === "ctc" || audio === null
              }
              onClick={() => runTextControl(false)}
            >
              無時間戳辨識控制組
            </button>
            <button
              disabled={
                busy || loaded === null || loaded === "ctc" || audio === null
              }
              onClick={() => runTextControl(true)}
            >
              原生段落辨識控制組
            </button>
            <button disabled={busy || loaded === null} onClick={release}>
              釋放模型
            </button>
            <button disabled={!busy && loaded === null} onClick={stop}>
              中止 worker
            </button>
          </div>
          <ul className="downloads">
            {Object.entries(progress).map(([file, value]) => (
              <li key={file}>
                {file} <strong>{value}</strong>
              </li>
            ))}
          </ul>
          <details>
            <summary>裝置與固定設定</summary>
            <pre>
              {JSON.stringify(
                { device, settings: SETTINGS, selectedModel: MODELS[model] },
                null,
                2,
              )}
            </pre>
          </details>
        </section>
        <section className="panel">
          <h2>02 / 執行結果</h2>
          <p>
            連跑三次可比較執行耗時；GPU 記憶體請搭配 Chrome 工作管理員觀察。
          </p>
          <table>
            <thead>
              <tr>
                <th>次數</th>
                <th>模型</th>
                <th>音訊秒數</th>
                <th>耗時</th>
                <th>詞數</th>
                <th>異常</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{r.model} q4</td>
                  <td>{seconds(r.secondsTested)}</td>
                  <td>
                    {seconds(r.elapsedMs == null ? null : r.elapsedMs / 1000)}s
                  </td>
                  <td>{r.analysis?.words.length ?? "—"}</td>
                  <td>{r.error ?? r.analysis?.anomalies.length ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!runs.length && (
            <p className="empty">尚無辨識結果；不以預設資料代替實測。</p>
          )}
          <button onClick={exportReport}>匯出本機診斷 JSON</button>
          {experimentRuns.length > 0 && (
            <table>
              <caption>改善實驗（CTC 詞數來自提供歌詞）</caption>
              <thead>
                <tr>
                  <th>設定</th>
                  <th>模型</th>
                  <th>耗時</th>
                  <th>詞數</th>
                  <th>異常</th>
                </tr>
              </thead>
              <tbody>
                {experimentRuns.map((r, i) => (
                  <tr key={i}>
                    <td>{r.experimentId}</td>
                    <td>{r.model} q4</td>
                    <td>{seconds((r.elapsedMs ?? 0) / 1000)}s</td>
                    <td>{r.analysis?.words.length}</td>
                    <td>{r.analysis?.anomalies.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {textControls.length > 0 && (
            <details>
              <summary>辨識模式控制組（不納入詞級評分）</summary>
              <pre>{JSON.stringify(textControls, null, 2)}</pre>
            </details>
          )}
          <p className="note">
            報告含辨識文字與歌詞，請留在本機。JS heap 不包含完整模型／GPU
            記憶體。
          </p>
        </section>
      </div>
      <section className="panel">
        <h2>03 / 詞級時間戳</h2>
        <p>
          {latest?.analysis?.text ?? "等待辨識。保留原始輸出，不修補異常時間。"}
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>詞</th>
                <th>開始</th>
                <th>結束</th>
                <th>檢查</th>
              </tr>
            </thead>
            <tbody>
              {latest?.analysis?.words.map((w, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{w.text}</td>
                  <td>{seconds(w.start)}</td>
                  <td>{seconds(w.end)}</td>
                  <td>
                    {latest
                      .analysis!.anomalies.filter((a) => a.index === i)
                      .map((a) => a.kind)
                      .join("；")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>04 / 歌詞對齊（實驗性段落轉接）</h2>
        <label>
          每行一句歌詞
          <textarea
            value={lyrics}
            disabled={busy}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder="貼上本機歌詞；此內容不會上傳。"
            rows={5}
          />
        </label>
        <p>
          {lines.length} 行歌詞 · {segments.length} 個重建段落 ·{" "}
          {aligned.filter((l) => l.matched).length}{" "}
          行匹配。匹配率不等於準確率；參考時間核對見下方。
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>歌詞</th>
                <th>開始</th>
                <th>結束</th>
                <th>相似度</th>
                <th>狀態</th>
              </tr>
            </thead>
            <tbody>
              {aligned.map((l, i) => (
                <tr key={i}>
                  <td>{l.line}</td>
                  <td>{seconds(l.start)}</td>
                  <td>{seconds(l.end)}</td>
                  <td>{l.score.toFixed(3)}</td>
                  <td>{l.matched ? "自動匹配，待核對" : "未匹配"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>05 / 人工參考時間評分</h2>
        <p>
          以相同音檔雜湊與歌詞文字核對參考資料。SRT 只作事後評分，沒有傳入辨識
          worker。
        </p>
        {quality ? (
          <>
            <p>
              {quality.eligible} 行可評分，{quality.excluded}{" "}
              行缺少獨立起點而排除。未匹配行保留在成功率分母；誤差統計只包含已匹配行。
            </p>
            <table>
              <thead>
                <tr>
                  <th>段落來源</th>
                  <th>已匹配／可評分</th>
                  <th>≤0.5 秒</th>
                  <th>≤1 秒</th>
                  <th>誤差中位數</th>
                  <th>P90</th>
                  <th>最差</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "停頓重建（預設）", value: quality },
                  { label: "Whisper 原生段落（診斷）", value: nativeQuality },
                ].map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>
                      {row.value
                        ? `${row.value.matched}/${row.value.eligible}`
                        : "尚無結果"}
                    </td>
                    <td>{row.value?.withinHalfSecond ?? "—"}</td>
                    <td>{row.value?.withinOneSecond ?? "—"}</td>
                    <td>{seconds(row.value?.medianAbsError)}</td>
                    <td>{seconds(row.value?.p90AbsError)}</td>
                    <td>{seconds(row.value?.worstAbsError)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {nativeInfo && (
              <p className="note">
                原生段落轉接：{nativeInfo.rejectedChunks.length}{" "}
                段缺少有效起訖，{nativeInfo.unassignedWords.length}{" "}
                個詞未能依起點歸入段落，均保留於診斷報告。
              </p>
            )}
          </>
        ) : (
          <p className="empty">
            尚無相同音檔與歌詞的參考評分；請載入本機素材並完成整首辨識。
          </p>
        )}
      </section>
      <section className="panel">
        <h2>06 / 改善實驗評分</h2>
        <p>
          英文順序配對要求行首兩詞連續一致、全行至少一半詞一致；不以參考時間選配對，也不補猜未匹配行。CTC
          的指派來自提供歌詞，不代表辨識成功。誤差只計已配對／指派行，成功率分母保留所有可評分行。
        </p>
        <table>
          <thead>
            <tr>
              <th>模型／設定</th>
              <th>文字來源</th>
              <th>配對／可評分</th>
              <th>≤0.5 秒</th>
              <th>≤1 秒</th>
              <th>誤差中位數</th>
              <th>P90</th>
            </tr>
          </thead>
          <tbody>
            {experimentEvaluations.map(
              (r, i) =>
                r && (
                  <tr key={i}>
                    <td>
                      {r.model} / {r.id}
                    </td>
                    <td>{r.source}</td>
                    <td>
                      {r.metrics.matched}/{r.metrics.eligible}
                    </td>
                    <td>{r.metrics.withinHalfSecond}</td>
                    <td>{r.metrics.withinOneSecond}</td>
                    <td>{seconds(r.metrics.medianAbsError)}</td>
                    <td>{seconds(r.metrics.p90AbsError)}</td>
                  </tr>
                ),
            )}
          </tbody>
        </table>
        {!experimentEvaluations.some(Boolean) && (
          <p className="empty">
            尚無相同音檔、歌詞與參考資料的整首改善實驗評分。
          </p>
        )}
      </section>
      <footer>
        可丟棄技術驗證 · 沒有後端推論 · 上游已知風險照常觀測 ·
        重新整理會清除本頁結果
      </footer>
    </main>
  );
}
