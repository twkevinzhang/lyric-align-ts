# MV3 runtime 與本地整合測試

公開 npm 0.1.0 會在 Chrome MV3 extension 的 `prepare()` 出現 `MODEL_LOAD_FAILED: Failed to fetch dynamically imported module: blob:chrome-extension://…`。一般網頁通過不代表 extension 可執行；錯誤發生在模型準備，不是歌詞配對。

Transformers.js 4.3.1 `src/backends/onnx.js` 的 `useWasmCache` 預設會把 ONNX JavaScript factory 轉成 Blob 再 import。MV3 的 script CSP 拒絕此模組；`wasm-unsafe-eval` 只允許 WASM 編譯。不能用放寬 CSP 解決。依據：[Chrome extension CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)。

原始碼改為 `configureRuntime()` 明確關閉 JS factory Blob cache／proxy Worker，維持單執行緒與模型快取，設定套件內固定版 `.mjs`／`.wasm` URL。保留 Transformers 已選擇的 runtime：一般使用 asyncify；上游為舊 Safari WASM 選用 standard 時，改用套件內對應 standard 資產，不複製瀏覽器偵測政策。Vite 使用 `?url&no-inline`，library build 選用 ONNX external-WASM export，避免重複內嵌 runtime。未修改辨識、歌詞配對、模型、量化、後端選擇或 API。

## 不發布 npm 的測試方式

在 `spike/`：

```sh
npm run test
npm run lint
npm run typecheck
npm run build
npm run pack:library
```

`npm pack` 只建立本機 tarball，不發布 registry。保持現有版本只是為測試候選包；正式發布前必須升版，不能覆寫公開 0.1.0。

在相鄰的 `yt-subtitle/` consumer：

```sh
npm install --no-save --package-lock=false ../lyric-align-ts/spike/dist/twkevinzhang-lyric-align-ts-0.1.0.tgz
node build.mjs --package
node --test build.test.mjs
node tests/e2e/library-host.mjs AUDIO_FILE LYRICS_FILE
node tests/e2e/library-host.mjs AUDIO_FILE LYRICS_FILE --cancel-transcribing
```

消費端 manifest／lockfile 不改成個人絕對路徑。`npm ci` 會恢復公開 registry 版本；本地修正不會因只提交 library repo 而自動進入公開 npm 安裝。

probe 使用隔離 Chrome profile、真正 MV3 manifest／offscreen／library Worker／IndexedDB PCM，對整首結果驗證同數同序同原文及合法時間；不使用假推論。報告保存於 consumer 的忽略目錄 `test-results/library-host/`，音檔與歌詞不提交。它不涵蓋 YouTube 音訊下載、搜尋服務或時間準確度承諾。

## 驗收狀態

2026-10-23，本地候選包通過 59 項 library 測試、lint、型別檢查、library／應用建置及 npm 檔案檢查。consumer 的 63 項測試與 2 項打包檢查也通過。

隔離 Chrome for Testing 156.0.8078.4／MV3 offscreen／WebGPU，使用本機 130.2988125 秒、16kHz mono PCM：

- 全曲通過 12/12 行同數同序同原文，所有 cue 滿足 0 ≤ start < end ≤ duration。
- `seek 0.00s T=0 step=0` 解碼進度後取消，回傳 `ABORTED`，Worker 終止；runner 等操作結束後 dispose。
- 取消後以新 session 重試全曲，仍為 12/12，觀測總耗時 151689ms（含 10 秒間隔的結果輪詢，非純推論耗時）。
- 測試安裝入口 SHA-256：`66e2495c228e7b2eb184d5daf9a72b6a41d44efce9fa4e26fba3def752dc7c96`；Worker SHA-256：`b47b02dd00b27b0ff864b26e37c0e9e07ac0deccd85ab54b813ad85530c28071`。本地報告位於 `.local/results/mv3-final-report.json`、`mv3-cancel-transcribing.json`，不提交音檔、歌詞或完整辨識內容。

本輪未執行 npm publish。Safari runtime 選擇只有回歸單測，沒有 Safari 裝置實測；WASM 全曲、跨 tab queue、背景節流及 GPU 釋放量測未驗證。文字與時間合法不等於演唱對齊精準度；consumer 的 YouTube 音訊下載仍不在本次測試範圍。
