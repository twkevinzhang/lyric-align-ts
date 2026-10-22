# @twkevinzhang/lyric-align-ts

瀏覽器端 Whisper ASR 與歌詞對齊，提供 contract v1 的 session API。ES module only；推論在 session 專用 module Worker 執行。

## 使用

```sh
npm install @twkevinzhang/lyric-align-ts
```

```ts
import { binding } from '@twkevinzhang/lyric-align-ts';

const controller = new AbortController();
const context = { signal: controller.signal, onProgress: console.log };
const session = await binding.createSession();
try {
  await session.prepare({ language: 'en' }, context);
  const segments = await session.transcribe(
    { pcm, sampleRate: 16000 }, // 完整、單聲道、有限數值 Float32Array
    { language: 'en' },
    context,
  );
  const lines = await session.align(segments, lyrics, { karaoke: false }, context);
  // 整首驗證成功後才套用字幕，所有時間為秒。
} finally {
  await session.dispose();
}
```

`pcm`、逐行 `lyrics` 由應用提供。套件不下載音訊、不控制播放器、不建立字幕或 SRT。空白行由應用保留於原文、排除於 align 輸入；其他行逐字保留、不插補。消費端須驗證全部行數、順序、原文、匹配與時間界限後才一次套用，score 是文字相似度，不是時間準確率。

預設 WebGPU，固定 `onnx-community/whisper-small.en_timestamped`、revision `8085393831131554ad978a4e438295a734d3d2c0`、q4，僅支援 `en`。另可 `createBinding({ device: 'wasm' })` 明確選擇既有 WASM 配置，不自動 fallback。`capabilities.lyricsContext=false`，不要傳歌詞提示。支援 pairing、threshold、window、karaoke=false；預設 auto／window4／文字門檻。

## 執行環境與資源

需要支援 module Worker、WebAssembly 及所選後端的桌面瀏覽器、安全來源與足夠記憶體。這不是 Node.js 推論套件。包內含固定版 Transformers.js、ONNX Runtime Web 與壓縮 runtime，沒有額外 npm runtime dependencies。模型權重不含於 npm 包，prepare 首次向 Hugging Face 下載固定 revision 並由瀏覽器快取；音訊及歌詞不會上傳至推論服務。

使用支援 Worker／`new URL(..., import.meta.url)` 資源處理的 bundler。若直接靜態載入，完整複製安裝目錄並保留 index.js 與 assets/ 的相對路徑，包含 runtime `.mjs`／`.wasm`，不要只複製 Worker。runtime 使用同來源靜態資產，關閉 Transformers 的 JS Blob factory cache，模型快取仍保留。extension CSP 可維持 `script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; object-src 'none'`，並允許模型下載；不需允許遠端 JavaScript、Blob script 或 unsafe-eval。host 啟用 COEP 時，Worker 回應必須使用相符 header。其他 bundler 與裝置仍須自行驗證。

## 生命週期

同 session 依序等待 prepare → transcribe → align，不並行。`controller.abort()` 終止專用 Worker，操作拒絕 `{ code: 'ABORTED', message }`；等待操作結束後再 dispose，重試另建 session。dispose 可重複呼叫，操作尚未結束時會拒絕提前 dispose。

錯誤為 `{ code, message }`。進度階段為 preparing-model、transcribing、aligning；sequence 在每次操作內從 1 遞增。有實測 total 才回報 measured（bytes/items 及 scope），否則為 indeterminate，不應推估百分比。

## 驗證與限制

Chrome WebGPU 真實完整 130.30 秒英文音訊：6 ASR 段、12/12 行合法匹配，原文與順序保持；真實推論中途取消及重複 dispose 已測。這不是任意歌曲品質承諾。WASM 核心另有既有驗證，但不代表已重測 npm 安裝後的 WASM 全曲、其他硬體或消費端 extension。

原創程式碼採 MIT；衍生演算法與內含依賴保留各自授權。詳見 LICENSE、THIRD_PARTY_NOTICES.md 與 licenses/。模型權重另外受模型來源授權約束。
