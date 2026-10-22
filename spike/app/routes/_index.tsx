import { useEffect, useRef, useState } from "react";
import {
  MODEL,
  SETTINGS,
  jsHeap,
  type Command,
  type HeapSample,
  type WorkerEvent,
} from "../lib/protocol";
import { parseLyrics } from "../lib/lyrics";
import { decodeAudio } from "../lib/audio";
import { completeRun, type AudioInfo, type Run } from "../lib/workflow";
import {
  canScoreRun,
  scoreLineStarts,
  type HumanReference,
} from "../lib/reference";

const sec = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(3));
const mib = (n: number | null) =>
  n == null ? "無法取得" : `${(n / 1048576).toFixed(1)} MiB`;
function saveReport(report: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `lyric-align-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Workspace() {
  const [phase, setPhase] = useState("請選擇音檔與提供英文歌詞");
  const [busy, setBusy] = useState(false);
  const [canStop, setCanStop] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [gpuReady, setGpuReady] = useState(false);
  const [device, setDevice] = useState<Record<string, unknown>>({
    status: "檢查中",
  });
  const [audio, setAudio] = useState<AudioInfo | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [reference, setReference] = useState<HumanReference | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [active, setActive] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [heap, setHeap] = useState<number | null>(null);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const worker = useRef<Worker | null>(null);
  const pcm = useRef<Float32Array | null>(null);
  const current = useRef<Run | null>(null);
  const lock = useRef(false);
  const stage = useRef("idle");
  const started = useRef(0);
  const samples = useRef<HeapSample[]>([]);
  const errors = useRef<{ at: string; message: string }[]>([]);

  function enter(name: string, cancellable = false) {
    setCanStop(cancellable);
    lock.current = true;
    setBusy(true);
    setError("");
    setPhase(name);
    stage.current = name;
  }
  function finish(name: string) {
    setCanStop(false);
    lock.current = false;
    setBusy(false);
    setPhase(name);
    stage.current = name;
  }
  function append(run: Run) {
    setRuns((prev) => [...prev, run]);
    setActive(-1);
  }
  function fail(message: string) {
    errors.current.push({ at: new Date().toISOString(), message });
    const failed = current.current;
    current.current = null;
    if (failed) append({ ...failed, error: message });
    worker.current?.terminate();
    worker.current = null;
    setLoaded(false);
    setError(message);
    finish("操作失敗，可重新載入模型");
  }
  useEffect(() => {
    started.current = performance.now();
    const timer = setInterval(() => {
      const bytes = jsHeap();
      setHeap(bytes);
      samples.current.push({
        elapsedMs: performance.now() - started.current,
        stage: stage.current,
        bytes,
        source: "main-js-heap",
      });
    }, 1000);
    let disposed = false;
    void (async () => {
      try {
        if (!navigator.gpu) throw new Error("此 Chrome 未提供 WebGPU。");
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("找不到 GPU adapter。");
        if (disposed) return;
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
        setGpuReady(true);
      } catch (e) {
        if (!disposed) setDevice({ status: String(e) });
      }
    })();
    return () => {
      disposed = true;
      clearInterval(timer);
      worker.current?.terminate();
    };
  }, []);
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );

  function getWorker() {
    if (worker.current) return worker.current;
    const instance = new Worker(new URL("../asr.worker.ts", import.meta.url), {
      type: "module",
    });
    instance.onerror = (e) => {
      if (worker.current === instance) fail(e.message);
    };
    instance.onmessage = ({ data }: MessageEvent<WorkerEvent>) => {
      if (worker.current !== instance) return;
      if (data.type === "progress") {
        const p = data.data as {
          file?: string;
          status?: string;
          progress?: number;
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
        setLoaded(true);
        setLoadMs(data.elapsedMs);
        finish("模型就緒");
      } else if (data.type === "tick") {
        setElapsed(data.elapsedMs);
        samples.current.push({
          elapsedMs: performance.now() - started.current,
          stage: "inference",
          bytes: data.jsHeapBytes,
          source: "worker-js-heap",
        });
      } else if (data.type === "result") {
        const run = current.current;
        if (!run) return;
        try {
          const completed = completeRun(run, data.output, data.elapsedMs);
          append(completed);
          current.current = null;
          setElapsed(data.elapsedMs);
          finish("全曲辨識與配對完成");
        } catch (e) {
          current.current = {
            ...run,
            output: data.output,
            elapsedMs: data.elapsedMs,
          };
          fail(String(e));
        }
      } else if (data.type === "released") {
        instance.terminate();
        worker.current = null;
        setLoaded(false);
        finish("模型已釋放，worker 已終止");
      } else fail(data.message);
    };
    worker.current = instance;
    return instance;
  }
  function send(command: Command) {
    getWorker().postMessage(command);
  }
  async function setSource(bytes: ArrayBuffer, name: string) {
    const decoded = await decodeAudio(bytes, name);
    pcm.current = decoded.mono;
    setAudio(decoded.info);
    setAudioUrl(URL.createObjectURL(new Blob([bytes])));
  }
  async function selectAudio(file: File) {
    if (lock.current) return;
    enter("解碼音訊");
    try {
      await setSource(await file.arrayBuffer(), file.name);
      finish("音訊就緒");
    } catch (e) {
      fail(String(e));
    }
  }
  async function loadLocal() {
    if (lock.current) return;
    enter("載入本機素材");
    try {
      const [file, text, ref] = await Promise.all([
        fetch("/__local/amazing-grace.m4a"),
        fetch("/__local/amazing-grace.txt"),
        fetch("/__local/reference.json"),
      ]);
      if (!file.ok || !text.ok)
        throw new Error("缺少本機音檔或歌詞，請使用選擇器。");
      const lyricText = await text.text();
      const mapping = ref.ok ? ((await ref.json()) as HumanReference) : null;
      await setSource(await file.arrayBuffer(), "amazing_grace.m4a");
      setLyrics(lyricText);
      setReference(mapping);
      finish("本機音訊與歌詞就緒");
    } catch (e) {
      fail(String(e));
    }
  }
  function loadModel() {
    if (lock.current || loaded || !gpuReady) return;
    enter("載入 small.en q4 模型", true);
    setProgress({});
    try {
      send({ type: "load" });
    } catch (e) {
      fail(String(e));
    }
  }
  function run() {
    if (lock.current || !loaded || !pcm.current || !audio) return;
    const lines = parseLyrics(lyrics);
    if (!lines.length || !lines.some((line) => /[a-z]/i.test(line))) {
      setError("請提供英文歌詞。");
      return;
    }
    enter("全曲辨識中", true);
    setElapsed(0);
    current.current = {
      startedAt: new Date().toISOString(),
      audio,
      lyrics: lines,
      secondsTested: audio.duration,
    };
    const copy = pcm.current.slice();
    try {
      getWorker().postMessage({ type: "run", audio: copy } satisfies Command, [
        copy.buffer,
      ]);
    } catch (e) {
      fail(String(e));
    }
  }
  function release() {
    if (lock.current || !loaded) return;
    enter("釋放模型", true);
    try {
      send({ type: "release" });
    } catch (e) {
      fail(String(e));
    }
  }
  function stop() {
    if (!worker.current) return;
    worker.current.terminate();
    worker.current = null;
    setLoaded(false);
    const interrupted = current.current;
    current.current = null;
    if (interrupted)
      append({ ...interrupted, error: "使用者中止；無完整結果。" });
    finish("已中止，worker 已終止");
  }
  const selected = runs[active < 0 ? runs.length - 1 : active];
  const score =
    selected?.lines &&
    reference &&
    canScoreRun(audio?.sha256, selected, reference)
      ? scoreLineStarts(selected.lines, reference.references)
      : null;
  const exportReport = () =>
    saveReport({
      schema: 4,
      profile: { model: MODEL, settings: SETTINGS },
      device,
      audio,
      modelLoadMs: loadMs,
      runs,
      heapSamples: samples.current,
      errors: errors.current,
      reference: reference
        ? { audioSha256: reference.audioSha256, source: reference.source }
        : null,
      limits:
        "No lyrics supplied to ASR. Native ASR segments matched with pairing 1/window 4. Original segment boundaries retained; no acoustic realignment or correction. No backend inference.",
    });

  return (
    <main>
      <header>
        <div>
          <div className="eyebrow">LYRIC ALIGN / BROWSER WORKSPACE</div>
          <h1>從歌聲到歌詞時間</h1>
          <p>獨立辨識 · 段落順序配對 · 全曲處理</p>
        </div>
        <span className="pill">small.en · q4 · WebGPU</span>
      </header>
      <div className="status" role="status">
        <strong>{phase}</strong>
        <span>
          辨識 {sec(elapsed / 1000)} 秒 · 主執行緒 JS heap {mib(heap)}
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="columns">
        <section className="panel">
          <h2>01 / 音檔與歌詞</h2>
          <label>
            音檔
            <input
              type="file"
              accept="audio/*,video/mp4"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void selectAudio(f);
                e.target.value = "";
              }}
            />
          </label>
          {import.meta.env.DEV && (
            <button disabled={busy} onClick={() => void loadLocal()}>
              載入本機 Amazing Grace
            </button>
          )}
          {audio && (
            <>
              <p>
                {audio.name} · {sec(audio.duration)} 秒 · {audio.sampleRate}{" "}
                Hz／單聲道
              </p>
              <audio aria-label="音檔播放" controls src={audioUrl} />
            </>
          )}
          <label>
            英文歌詞
            <textarea
              rows={8}
              value={lyrics}
              disabled={busy}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="每行一句；重複段落依演唱順序完整列出"
            />
          </label>
          <p className="note">
            歌詞只在辨識完成後配對，不傳入
            ASR。採用原始段落時間，未匹配行保持空值。
          </p>
        </section>
        <section className="panel">
          <h2>02 / 全曲處理</h2>
          <p>
            固定使用 small.en q4；30 秒視窗、5 秒重疊。首次載入需要下載模型。
          </p>
          <div className="actions">
            <button disabled={busy || loaded || !gpuReady} onClick={loadModel}>
              載入模型
            </button>
            <button
              className="primary"
              disabled={busy || !loaded || !audio || !lyrics.trim()}
              onClick={run}
            >
              開始全曲對齊
            </button>
            <button disabled={busy || !loaded} onClick={release}>
              釋放模型
            </button>
            <button disabled={!canStop} onClick={stop}>
              中止
            </button>
          </div>
          <p className="note">
            模型載入 {sec(loadMs == null ? null : loadMs / 1000)}{" "}
            秒。辨識時間不含模型載入與音訊解碼。
          </p>
          <ul className="downloads">
            {Object.entries(progress).map(([file, status]) => (
              <li key={file}>
                <span>{file}</span>
                <span>{status}</span>
              </li>
            ))}
          </ul>
          <details>
            <summary>裝置與固定設定</summary>
            <pre>
              {JSON.stringify(
                { device, model: MODEL, settings: SETTINGS },
                null,
                2,
              )}
            </pre>
          </details>
          <p className="note">
            JS heap 不等於總 RAM 或顯示記憶體；GPU
            程序記憶體需另行採樣。上游時間戳與資源釋放限制仍適用。
          </p>
        </section>
      </div>
      <section className="panel">
        <h2>03 / 對齊結果</h2>
        <div className="actions">
          <label className="run-picker">
            執行紀錄
            <select
              value={active < 0 ? runs.length - 1 : active}
              disabled={!runs.length}
              onChange={(e) => setActive(Number(e.target.value))}
            >
              {!runs.length && <option value={0}>尚無結果</option>}
              {runs.map((r, i) => (
                <option key={i} value={i}>
                  第 {i + 1} 次 ·{" "}
                  {r.error ? "未完成" : `${sec((r.elapsedMs ?? 0) / 1000)} 秒`}{" "}
                  · {r.audio.name}
                </option>
              ))}
            </select>
          </label>
          <button disabled={!runs.length} onClick={exportReport}>
            匯出本機診斷 JSON
          </button>
        </div>
        {!selected && (
          <p className="empty">
            載入模型並開始全曲對齊。結果保留原始時間，未匹配行不補時間。
          </p>
        )}
        {selected?.error && <p className="error">{selected.error}</p>}
        {selected?.analysis && (
          <>
            <div className="metrics">
              <p>
                <strong>{selected.analysis.segments.length}</strong> 原始段落
              </p>
              <p>
                <strong>
                  {selected.lines?.filter((l) => l.matched).length} /{" "}
                  {selected.lyrics.length}
                </strong>{" "}
                行配對
              </p>
              <p>
                <strong>{selected.analysis.anomalies.length}</strong> 時間異常
              </p>
              <p>
                <strong>
                  {((selected.wordErrors?.rate ?? 0) * 100).toFixed(1)}%
                </strong>{" "}
                ASR WER
              </p>
            </div>
            <p className="note">
              每行搜尋接下來最多 4 個 ASR 段落，英文字元相似度須大於 0.50。
              成功時沿用段落起訖；未匹配行不補時間。WER 使用獨立 ASR 文字計算。
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>行</th>
                    <th>歌詞與匹配段落</th>
                    <th>起點／終點（秒）</th>
                    <th>狀態／字元相似度</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines?.map((line, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>
                        <details>
                          <summary>{line.line}</summary>
                          {line.segmentIndex !== null && (
                            <p>
                              ASR 段落 {line.segmentIndex}（0 起算）：
                              {
                                selected.analysis!.segments[line.segmentIndex]
                                  .text
                              }
                            </p>
                          )}
                        </details>
                      </td>
                      <td>
                        {sec(line.start)} / {sec(line.end)}
                      </td>
                      <td>
                        {line.matched ? "已配對，時間待核對" : "未配對"} ·{" "}
                        {(line.score * 100).toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details>
              <summary>原始辨識文字與段落時間異常</summary>
              <p>{selected.analysis.text}</p>
              <table>
                <thead>
                  <tr>
                    <th>索引</th>
                    <th>段落</th>
                    <th>起點／終點</th>
                    <th>問題</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.analysis.anomalies.map((a, i) => {
                    const w = selected.analysis!.segments[a.index];
                    return (
                      <tr key={i}>
                        <td>{a.index}</td>
                        <td>{w.text}</td>
                        <td>
                          {sec(w.start)} / {sec(w.end)}
                        </td>
                        <td>{a.kind}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </details>
          </>
        )}
        <p className="note">
          匯出內容包含歌詞及辨識文字，請留在本機。重新整理會清除頁面結果。
        </p>
      </section>
      <section className="panel">
        <h2>04 / 人工參考評分</h2>
        {score ? (
          <>
            <div className="metrics">
              <p>
                <strong>
                  {score.matched} / {score.eligible}
                </strong>{" "}
                可評分行配對
              </p>
              <p>
                <strong>
                  {score.withinHalfSecond} / {score.eligible}
                </strong>{" "}
                誤差 ≤0.5 秒
              </p>
              <p>
                <strong>
                  {score.withinOneSecond} / {score.eligible}
                </strong>{" "}
                誤差 ≤1 秒
              </p>
              <p>
                <strong>
                  {sec(score.medianAbsError)} / {sec(score.p90AbsError)}
                </strong>{" "}
                中位數／P90（秒）
              </p>
            </div>
            <p>
              最差誤差 {sec(score.worstAbsError)} 秒；{score.unmatched}{" "}
              行未匹配，{score.excluded} 行缺少參考而排除。
            </p>
            <details>
              <summary>逐行時間誤差</summary>
              <table>
                <thead>
                  <tr>
                    <th>行</th>
                    <th>人工起點</th>
                    <th>預測起點</th>
                    <th>有號誤差（秒）</th>
                  </tr>
                </thead>
                <tbody>
                  {score.rows.map((r) => (
                    <tr key={r.lineIndex}>
                      <td>{r.lineIndex + 1}</td>
                      <td>{sec(r.referenceStart)}</td>
                      <td>{sec(r.predictedStart)}</td>
                      <td>{sec(r.signedError)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        ) : (
          <p className="empty">
            需要整首結果、相同音檔雜湊與相同歌詞的人工對應資料。本機素材按鈕可載入已核對的參考。
          </p>
        )}
        <p className="note">
          人工參考只用於評分，不傳入推論或配對。成功率分母包含所有可評分行；誤差分位數僅計已匹配行。行級起點參考不能驗證行尾。
        </p>
      </section>
      <footer>桌面 Chrome · 純瀏覽器推論 · GTX 1050 Ti／q4 驗證主線</footer>
    </main>
  );
}
