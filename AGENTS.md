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

靜音 smoke test 只證明執行與生命週期行為。變更時間邊界或效能時，使用相關 benchmark／acceptance scripts 與實際音訊資料，報告資料集、設定與觀察結果；不要將 smoke test 宣稱為準確度驗證。

## 修改時必須保留的行為

- 瀏覽器推論需要 HTTPS 或 localhost、Worker、WebAssembly、SharedArrayBuffer 與 cross-origin isolation。伺服器需提供 `Cross-Origin-Opener-Policy: same-origin` 及 `Cross-Origin-Embedder-Policy: require-corp`；參考 `scripts/static-server.mjs`。
- `src/worker.ts` 必須維持 classic Worker／IIFE 建置，因 Emscripten 載入使用 `importScripts()`。公開入口維持 browser ESM，避免 Node API 或開發機路徑進入發布 bundle。
- 正式引擎設定以 `src/worker.ts` 傳入值與 `BrowserEngine` 預設值合併後為準。不要只看 engine constructor 或上游來源說明就推斷正式參數；`__ALIGN_EXPERIMENT__` 是 benchmark bundler 的實驗覆寫點。逐 token 進入證據（entry）是無條件的正式路徑，不再有旗標：在 17 首日文歌中修復了 Koi wo Shita no wa、Freesia 等整首偏移，但 Survivor、Sora ni Utaeba 仍有後段偏移，個別歌曲（Curtain Call）略有退步。已用 17 首歌逐詞比對確認，移除未使用的實驗旋鈕（no-speech 探針、attention 背景扣除、mean prefix evidence、head consensus、拍數時長先驗、sentence commit、intro 邊界等）前後輸出完全相同；`lyricPauses` 與 `posteriorBoundaries:'ends'` 經移除實驗確認有效，需保留。native 的 alignment-only 模式（`_poc_set_alignment_only`）已移除：它只在 vocab subset 大小為 1 時生效，引導解碼從未滿足，開關對輸出與速度皆無差異，且與 entry 所需的 logits 不相容。
- 窗口重試（`src/engine/engine.mjs` 的 `windowRetry`，由 `src/worker.ts` 的正式設定啟用）：某窗的歌詞消耗速率偏離前面窗口中位數（<0.65 或 >1.5 倍）且該窗平均證據 <ln(.25) 時，從 +1.6 秒、+3.2 秒（虛擬時間）的較晚起點重新編碼並解碼，取速率回到區間內且證據不低於原窗的候選，結果位移回原窗座標。只在 SUNEO-ISM（整首漂移）上有可量到的效果（起頭 ≤1 秒 57→113／125，結束 58→113），其餘 18 首與 5 首隨機英文歌輸出逐詞相同；門檻在看過事件記錄後訂定，證據只有單一首歌，沒有單元測試（邏輯在引擎閉包內），以基準測試驗證。跨窗保留多候選的 beam 規劃（路線 14）已試過，整體變差且慢 2.5 倍以上，未採用。首窗冷啟動（歷史不足時只憑證據分數選較晚起點）與加長位移（至 +51 秒）也在英文歌（乾淨的 33 首，歌詞非全大寫、無標題卡）試過六種設定，淨修好句數皆為負（−11 至 −57 句；單獨冷啟動 21／34、單獨加長位移 17／30，位移到 +12.8 秒的組合曾使 e033 一首掉 40 句），未採用；位移是加在最後一個時間戳 token 的編號上，位移加窗口長度超過約 1500 影格會產生無效 token 並使 Worker 失敗，所以此機制無法跳過長前奏。英文歌的句子結尾比參考晚約 0.5 秒（日文約 0.2 秒），關閉 posterior、歌詞停頓或改用完整 posterior 都不改變此偏差；11 句人工聽測 6 句貼近引擎、5 句貼近參考，判定為參考標注與引擎各占一半的偏差，不加英文位移校正。
- 大偏差修補（`src/core/refine.mjs`，由 `src/index.ts` 的 `align()` 在第一輪整首對齊後執行）是正式路徑，沒有關閉開關：僅對 `language` 為 `ja` 或 `en` 啟用（門檻以日文校準，英文只做過驗證；其他語言維持單輪）。流程：用輸出本身的特徵標記可疑行（每 token 均長 <0.1 秒、單一 token >3 秒、每字時長偏離全曲中位數 >e¹）→ 可疑行超過 25% 則整首跳過 → 每段可疑行以前後各一行為錨點，切出原始音訊片段重跑 worker → 錨點位置與原結果差在 0.5 秒內、內部行皆匹配、且匹配行數不減少才採用；最多向外擴展一行再試。修補前會 `slice()` 一份原始 PCM（第一輪會轉移並 detach 傳入的 buffer）。`metrics` 新增 `refinementSeconds`、`refinedLines`。常數與依據見 `REFINE`：17 首日文歌交叉驗證加春泥棒、SUNEO-ISM 留出測試，起頭誤差 ≤1 秒 516→531／587 與 105→107／181，無改壞，額外對齊時間約 +9%；SUNEO-ISM 整首漂移（被標記行 >25%）會被跳過，修補不解決整首失敗。英文以乾淨的 33 首（歌詞非全大寫、無標題卡）驗證：起頭 ≤1 秒 66.5%→67.3%，修好／弄壞 17／8，8 首變好、4 首變差，額外耗時約 15%；整首跳過門檻放寬到 50% 只多修好 1 句，未採用。英文證據只有這 33 首，量級小於日文，不顯著。
- 音訊輸入為 16 kHz 單聲道、有限數值的 Float32 PCM。直接 API 使用 `samples`，session contract 使用 `pcm`；不要混淆兩種輸入型別，也不要意外轉移並 detach 呼叫端的 buffer。
- 公開時間單位為秒；注意原曲時間、虛擬音訊時間與 attention frame 的轉換，避免重複縮放。
- 同一 aligner／session 不接受並行作業。保留 abort、busy、Worker 錯誤傳遞與冪等 dispose 行為；取消後不得意外復活已終止實例。進度 observer 拋錯不應破壞推論。
- Session 對齊保留輸入歌詞的數量、順序與原文；未匹配結果使用契約規定的空時間。`score` 是文字相似度，不是時間戳準確度。SRT 會略過無效／缺失／零長度 cue，問題需保留於 `issues`。
- 以 `src/binding.ts` 的 capabilities 為已實作能力依據，不要把型別中列出的所有選項視為已支援。目前語言為 `en`、`ja`、`zh`，對齊選項為 `threshold` 與 `karaoke: false`，`lyricsContext` 未支援。

## 風格、來源與發布

- 沿用相鄰檔案風格：ES modules、具副檔名的相對匯入；公開 API 使用 strict TypeScript，演算法與腳本多使用 `.mjs`。避免為小修改整檔重新排版或導入新框架／工具鏈。
- 更動公開 API 時，同步檢查 root exports、`./binding` exports、型別、相關測試及 consumer package check。調整版本時確認 `package.json` 與 binding 的 `libraryVersion` 一致。
- 更動 C++／JS bridge 時同步檢查 `_poc_*` ABI、native exports 與 `src/engine/native-context.mjs` 等呼叫端。
- 上游依賴、模型與 tokenizer 使用固定版本及 SHA-256。修改時同步更新相關來源與驗證，勿繞過 `build-proof`、asset manifest 或 `prepack` 檢查。
- 已不再有 vendor 目錄：源自 Echogarden 3.4.0（MIT）的程式已併入 `src/engine/`（`whisper.mjs`、`dtw.mjs`、`vector-math.mjs`、`word-patterns.json`），不再從上游更新。保留檔頭的授權聲明；本地差異與來源雜湊記在 `THIRD_PARTY_NOTICES.md`，修改這些檔案時一併更新。
- VAD 研究路線已退役；相關 runtime、Worker、離線分析與專用測試已移除，benchmark 不再建置或提供其資產。正式 Whisper／attention／DTW 對齊路徑維持不變。
- 發布範圍由 `package.json` 的 `files` 與 `scripts/test-package.mjs` 驗證。模型權重、測試音訊、快取、研究用資產不得混入發布包。
- `prepack` 只檢查既有產物，不會自動建置。來源變更後重新建置，以確保來源指紋、bundle、宣告檔與靜態資產一致。
