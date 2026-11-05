# 專案協作指南

本文件適用於整個 repository。修改前先閱讀相關原始碼與測試；以下指令皆從專案根目錄執行。
每次修改完這份專案，都應該 renew 這份文件。

## 專案定位

`lyric-align-ts` 是瀏覽器 CPU／WebAssembly 歌詞對齊函式庫，不是 React 應用或伺服器服務。音訊轉為 16 kHz 單聲道後，交由 classic Worker 執行 Whisper C++／WASM、歌詞引導解碼與注意力／DTW 對齊，再輸出逐詞時間軸、逐句 cues 與 SRT。

保留兩組公開介面及其不同語意：

- `createAligner()`：直接將音訊與已知歌詞對齊，型別在 `src/types.ts`。
- `binding`／`createBinding()`：提供 `createSession()`、`prepare()`、`transcribe()`、`align()`、`dispose()`，契約在 `src/contract.ts`；其中 `align()` 接收轉錄 segments，而非原始音訊。

時間戳是估計值；可執行、文字相似或輸出完整不等於時間對齊準確。

## 程式碼地圖

| 路徑 | 職責 |
| --- | --- |
| `src/index.ts`、`src/types.ts` | 直接對齊 API、Worker 通訊、取消與資源生命週期 |
| `src/binding.ts`、`src/contract.ts` | Session API、能力宣告、輸入驗證與結構化錯誤 |
| `src/audio.ts`、`src/cues.ts`、`src/subtitles.ts` | PCM 準備、時間軸映射、SRT 解析與輸出 |
| `src/worker.ts` | 正式 Worker 入口、正式引擎設定、訊息分派 |
| `src/engine/` | WASM adapter、引導解碼、轉錄、注意力與邊界演算法，含併入的 Echogarden Whisper 對齊程式 |
| `src/core/` | 歌詞／token、時間縮放、評分與驗收工具；`refine.mjs` 為大偏差修補階段 |
| `native/` | C++ bridge、SIMD kernels、CMake 與版本鎖定；另見 `native/README.md` |
| `scripts/` | 建置、來源與產物驗證、靜態伺服器、瀏覽器測試及基準分析 |
| `tests/{core,api,engine,native}/` | Node 內建 test runner 測試 |
| `examples/browser/index.html` | 純靜態瀏覽器範例 |
| `.github/workflows/ci.yml` | 完整 CI 驗證順序 |

`.local/` 是下載、產生的 native 原始碼、模型、報告與測試產物快取；`dist/` 是發布產物。不要直接修改這些檔案來代替修改來源。`spike/` 不在目前 pnpm workspace 的套件清單中，勿把其中殘留的建置／依賴目錄當成主專案。

## 環境與常用指令

- Node.js `>=22.18.0`；CI 使用 Node 24。
- 使用 `package.json` 指定的 pnpm `11.25.0` 與既有 `pnpm-lock.yaml`。
- Native 建置需要 Git、Docker Linux containers；Docker 必須啟動。可用 `DOCKER_BIN` 指定執行檔。

```sh
pnpm install --frozen-lockfile
pnpm run build:native
pnpm run build
pnpm run typecheck
pnpm test
```

注意：

- `build:native` 使用 `native/lock.json` 鎖定的 Whisper fork 與 Emscripten Docker image，產生 `.local/native/build/parity.js`、`parity.wasm` 及 build proof。編譯與 kernel checks 不需要模型。
- `build` 會清空並重建 `dist/`，需要已驗證的 native build；可透過 `NATIVE_BUILD_DIR` 指向相容且通過驗證的建置目錄。首次執行可能下載 tokenizer。
- `typecheck` 同時檢查 DOM 與 WebWorker TypeScript 設定；目前沒有獨立的 lint／format script。
- 開發範例：先完成建置，再執行 `pnpm dev`，開啟 `http://localhost:5175/examples/browser/`。`PORT` 可覆寫連接埠；此指令只是靜態伺服器，不會監看或重建來源。

## 測試與驗證

依變更範圍選擇驗證，明確記錄實際執行及缺少前置條件的項目。

- 單一測試可直接執行，例如 `node --test tests/core/audio-time-scale.test.mjs`。
- API／引擎變更執行 `pnpm run typecheck` 與 `pnpm test`；Node 測試直接匯入 `.ts`／`.mjs`，使用 `node:test` 與 `node:assert/strict`。
- Native 變更需重新執行 `pnpm run build:native`，再重建 package。`NATIVE_SOURCE_TEST=1` 可啟用額外來源準備、golden hashes 與可重複性檢查，初次需要 Git／網路。
- 真實 WASM、Worker、取消與釋放行為，以瀏覽器整合測試確認；mock Worker 的單元測試不能取代它們。

瀏覽器與發布檢查的前置步驟及指令：

```sh
node scripts/native/model.mjs
pnpm exec playwright install --with-deps chrome
pnpm run test:browser
pnpm run test:contract
pnpm run test:package
```

上述檢查需要最新 `dist/` 與 Chrome（腳本指定 `channel: 'chrome'`）。預設模型位於 `.local/native/ggml-tiny-q5_1.bin`，可用 `MODEL_PATH` 指向相容模型；contract／package 測試另需 native source 的 `samples/jfk.wav`。`test:package` 必須透過套件管理器執行，會打包、安裝至隔離 consumer、檢查型別並實際執行瀏覽器推論。

## 修改時必須保留的行為

- 瀏覽器推論需要 HTTPS 或 localhost、Worker、WebAssembly、SharedArrayBuffer 與 cross-origin isolation。伺服器需提供 `Cross-Origin-Opener-Policy: same-origin` 及 `Cross-Origin-Embedder-Policy: require-corp`；參考 `scripts/static-server.mjs`。
- `src/worker.ts` 必須維持 classic Worker／IIFE 建置，因 Emscripten 載入使用 `importScripts()`。公開入口維持 browser ESM，避免 Node API 或開發機路徑進入發布 bundle。
- 音訊輸入為 16 kHz 單聲道、有限數值的 Float32 PCM。直接 API 使用 `samples`，session contract 使用 `pcm`；不要混淆兩種輸入型別，也不要意外轉移並 detach 呼叫端的 buffer

## 風格、來源與發布

- 沿用相鄰檔案風格：ES modules、具副檔名的相對匯入；公開 API 使用 strict TypeScript，演算法與腳本多使用 `.mjs`。避免為小修改整檔重新排版或導入新框架／工具鏈。
- 更動公開 API 時，同步檢查 root exports、`./binding` exports、型別、相關測試及 consumer package check。調整版本時確認 `package.json` 與 binding 的 `libraryVersion` 一致。
- 更動 C++／JS bridge 時同步檢查 `_poc_*` ABI、native exports 與 `src/engine/native-context.mjs` 等呼叫端。
- 發布範圍由 `package.json` 的 `files` 與 `scripts/test-package.mjs` 驗證。模型權重、測試音訊、快取、研究用資產不得混入發布包。
