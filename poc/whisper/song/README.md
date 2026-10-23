# 實際歌曲對齊比較

以完整 WAV 與已知歌詞執行官方 Echogarden 3.4.0 `Whisper.align`，比較官方 Windows CPU 後端與 Chrome WASM PoC。這是歌詞引導對齊，不是自由語音辨識；SRT 僅供完成後評分。現有 ONNX 主線不變。

兩端共用 Echogarden 的 tokenizer、分段、歌詞約束解碼、QK／DTW 對齊程式。Chrome 真正執行模型的 PCM→Mel、encoder 與 decoder，但其餘流程暫由 Node.js 控制，透過 loopback 傳送音訊段與張量。這不是已完成的純瀏覽器移植。

## 固定條件

- 與數值 PoC 同一個 `ggml-small-q5_1.bin`，SHA-256 見上一層 `lock.json`，多語 small，非 small.en。
- English、基線 CPU 1 thread，本次改善版與官方對照皆 CPU 6 threads、flash attention 關閉、medium timestamp accuracy（small 預設 10 heads）。不做人聲分離、不裁切、不做額外 VAD。
- 歌詞引導解碼沿用官方 temperature 0、topCandidateCount 1、無 prompt、無 autoPrompt、無 repetition suppression；endTokenThreshold 0.9。請求 maxTokensPerPart 448，官方實作兩端皆截為其固定上限 220。
- Echogarden 3.4.0、binding 0.2.2；Windows CPU package `whisper.cpp-lib-windows-x64-cpu-20260720`。官方 DLL 的 commit 是否等於 PoC 固定 fork 尚未驗證。
- 官方保留原始 N-API logits 行為，PoC 使用最後 token 對應的正確 logits 列。官方首次 prefill 的 logits 實測為全零；因此本比較有已知橋接差異，不能把結果差異全部歸因於浮點運算。

## 重跑

沿用上一層 setup 準備模型與 fork，並安裝官方 `echogarden@3.4.0`。指定套件資料夾（包含 `package.json` 與 `dist/`），不改官方套件檔案。預設會讀取這台機器已有的 `C:/Projects/lyric-align-ts/.local/echogarden-test/node_modules/echogarden`；其他環境請設定 `ECHOGARDEN_DIR`。

```powershell
$env:ECHOGARDEN_DIR = '你的套件目錄/node_modules/echogarden'
$env:SONG_DIR = 'C:/Users/DragonXwin10/Downloads/audio/TestSet/amazing_grace'
$image = (Get-Content poc/whisper/lock.json -Raw | ConvertFrom-Json).buildImage
& 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' run --rm -v "${PWD}:/work" -w /work $image bash poc/whisper/song/build.sh
node poc/whisper/song/native.mjs
node poc/whisper/song/serve.mjs
# 在 Chrome 開啟 http://127.0.0.1:5174/，按「開始完整音檔推論」。
# 完成後另開終端：
node poc/whisper/song/report.mjs
node --test poc/whisper/song/score.test.mjs
# 完成後在 server 終端 Ctrl+C，勿讓測試伺服器繼續運行。
```

輸入檔名固定為 `256k-16kHz-單聲道.wav`、`Original.txt` 與評分用的 `Original.srt`。結果位於 `.local/whisper-poc/song/`：

- `native.json`、`wasm.json`：原始逐詞結果、來源雜湊、選項、耗時與模型呼叫數。
- `native.srt`、`wasm.srt`：按輸入歌詞行合併的實測字幕，不對照答案修正。
- `comparison.html`：內嵌原音檔，可點每句播放標準／官方／WASM 區間，不需啟動伺服器。
- `comparison.json`：每句開始／結束的正負誤差、平均／最大誤差、0.5／1 秒內句數，以及全部原始資料。

歌詞行與逐詞結果必須完整依序匹配才評分。零 confidence 補齊詞、無效或倒退時間會標記失敗，不以插值製造結果。時間有效句數不是時間正確句數。句尾使用最後一詞結束，與 SRT 可能保留停頓的句尾直接比較；不為此改答案。

推論耗時從 tokenizer／模型初始化起算，到完整對齊完成，WASM 包含本機傳輸開銷。另存 encode/decode 計算時間；不含依賴安裝、模型下載／傳入瀏覽器、WASM 模組編譯、音檔解碼準備、報告評分。官方版最終採用沒有同時編譯或 WASM 推論的單獨複測，WASM 一次完整執行；不是統計效能基準。

## 單執行緒比較基線（保留作改善幅度對照）

音檔長 `130.2988125` 秒，12 句、75 詞。兩端都完成全音檔，各 6 次 encoder、114 次 decoder，全部句子的時間數值合法，無零 confidence 補齊詞。合法不代表與標準時間一致。

| 指標 | 官方 Echogarden Windows CPU | Chrome WASM PoC |
| --- | ---: | ---: |
| 推論耗時 | 105.35 秒（1 分 45 秒） | 722.29 秒（12 分 2 秒） |
| 句首平均絕對誤差 | 1.1233 秒 | 1.1167 秒 |
| 句尾平均絕對誤差 | 1.2033 秒 | 1.2033 秒 |
| 句首誤差 ≤ 1 秒 | 10 / 12 | 10 / 12 |
| 句尾誤差 ≤ 1 秒 | 6 / 12 | 6 / 12 |
| 首尾皆誤差 ≤ 1 秒 | 5 / 12 | 5 / 12 |
| 最大句首誤差 | 提早 6.6 秒 | 提早 6.6 秒 |
| 最大句尾誤差 | 提早 2.78 秒 | 提早 2.78 秒 |

11 句的起訖時間完全相同；只有第 9 句開始時間為官方 `86.86` 秒、WASM `86.78` 秒，差 `0.08` 秒，標準為 `86.20` 秒。所有句尾兩端完全相同。第一句兩端都從 `0` 秒開始，而標準為 `6.6` 秒；沒有為了改善分數裁掉前奏或改寫預測時間。

本次 WASM 推論耗時約為官方的 `6.86` 倍；WASM encoder 累計約 `705.83` 秒、decoder 約 `13.97` 秒。官方複測與先前執行的整份逐詞 timeline 完全相同。

觀察結論：這首歌中，張量數值差異沒有造成明顯的**逐句字幕時間**差異，WASM 速度則明顯較慢。不能據此宣稱所有歌曲或逐詞張量等價，也不能將相同輸入歌詞當成 ASR 辨識正確率。可靠度分數：95%（限本曲、上述固定條件）；可用未參與開發的其他歌曲與相同流程檢驗是否可推廣。

## WASM 多執行緒與建置選擇

歌曲效能版本使用 `song/build-perf.sh`，產生通用核心控制組 `build-song-generic` 與改善版 `build-song-simd`。原版已使用 `-msimd128`，但固定 Emscripten 的 processor 值為 x86，使這版 GGML 落入 generic 分支。改善版在加入 GGML 前指定 wasm32，納入 fork 自帶的 `ggml-cpu/arch/wasm/quants.c`；不修改量化演算法、不啟用 relaxed SIMD、不更換模型。既有合成張量 PoC 的預設建置與容差保留。

責任劃分：

- 瀏覽器主執行緒只處理按鈕、進度與取消，不執行同步推論或等待 pthread。
- 一個應用 Worker 擁有唯一 WASM module、model context 與共享記憶體；所有 encoder／decoder 呼叫依序執行。
- Emscripten 預熱 6 個 pthread Worker。設定 6 個計算執行緒時，包含應用 Worker 自己和 5 個助手；不是載入 6 份模型。多餘預熱 Worker 閒置。
- COOP／COEP、SharedArrayBuffer 為必要條件；不符合就明確失敗。禁止主頁阻塞等待，池耗盡立即報錯；不在已有應用 Worker 上重複套用 PROXY_TO_PTHREAD。
- 取消或離頁會終止應用 Worker 及其子 Worker，並拒絕 Node 待處理 RPC。已在 encoder 執行期間實測取消與重新開始。

這遵循 [Emscripten pthread 文件](https://emscripten.org/docs/porting/pthreads.html) 的背景執行與預熱池要求；[SIMD 文件](https://emscripten.org/docs/porting/simd.html) 說明指令開關與平台限制。執行緒上限 6 是本機 Ryzen 5 3600（6 實體／12 邏輯核心）的 PoC 選擇，其他裝置應重新校準，不把 hardwareConcurrency 直接當最佳執行緒數。

```powershell
$image = (Get-Content poc/whisper/lock.json -Raw | ConvertFrom-Json).buildImage
& 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' run --rm -v "${PWD}:/work" -w /work $image bash poc/whisper/song/build-perf.sh
$env:SONG_OUTPUT = 'song-perf-t6'
$env:SONG_WASM_BUILD = 'simd'
$env:SONG_THREADS = '6'
$env:SONG_MODE = 'full'
node poc/whisper/song/serve.mjs
# Chrome 完成整曲後，停止 server，再單獨執行官方版：
node poc/whisper/song/native.mjs
node poc/whisper/song/report.mjs
# 若已有 song 基線與兩組校準資料，再產生四列效能比較：
node poc/whisper/song/performance-report.mjs
```

校準模式設定 `SONG_MODE=calibrate`、`SONG_CALIBRATE_THREADS=1,2,4,6,6,4,2,1`，另設 `SONG_OUTPUT` 保存獨立結果。僅用音檔前 30 秒 encoder 的兩次中位耗時選擇最快值 5% 範圍內最少的執行緒數；不使用標準字幕挑選參數。通用核心控制組使用 1、4 執行緒各一次。計時拆分 Mel、encoder、decoder，保存實際瀏覽器與 JS／WASM SHA-256。校準不代表整曲字幕品質。


## 目前完整歌曲結果：專用 WASM 核心、6 執行緒

固定模型、音檔與歌詞的 SHA-256 全部相同，其他推論選項不變。前 30 秒 encoder 校準結果：通用核心 1／4 執行緒為 138.16／42.12 秒（各一次）；WASM 專用核心 1／2／4／6 執行緒中位耗時為 93.09／47.22／26.57／19.45 秒（各兩次）。依預先規則選 6 執行緒，沒有依字幕答案選參數。

| 指標 | 官方 Echogarden，6 threads | Chrome WASM，6 threads |
| --- | ---: | ---: |
| 整曲推論耗時 | 43.84 秒 | 143.17 秒 |
| 句首平均絕對誤差 | 1.1233 秒 | 1.1167 秒 |
| 句尾平均絕對誤差 | 1.2033 秒 | 1.2333 秒 |
| 句首誤差 ≤ 1 秒 | 10 / 12 | 10 / 12 |
| 句尾誤差 ≤ 1 秒 | 6 / 12 | 7 / 12 |
| 首尾皆誤差 ≤ 1 秒 | 5 / 12 | 5 / 12 |
| 最大句首誤差 | 提早 6.6 秒 | 提早 6.6 秒 |
| 最大句尾誤差 | 提早 2.78 秒 | 提早 3.38 秒 |
| encoder／decoder 次數 | 6 / 114 | 6 / 120 |

改善後 WASM 比原單執行緒基線快 5.05 倍，但仍耗費同執行緒數官方版的 3.27 倍時間。WASM encoder 累計 129.72 秒、Mel 0.24 秒、decoder 10.44 秒；官方 encode（含 Mel）39.01 秒、decode 2.44 秒。主要剩餘耗時仍是 encoder，不能歸咎於網路 RPC。剩餘差距中，各種原生指令與記憶體行為的個別占比尚未定位，不宣稱只加執行緒就能達到原生速度。

目前 7 句起訖時間與官方完全相同。第 9 句開始相差 0.08 秒；第 6、8、10、11 句結束分別相差 -0.60、+0.16、-0.04、+0.12 秒。第 6 句官方結束 62.44 秒、WASM 61.84 秒，標準 65.22 秒，是此次最明顯退步。第一句仍從 0 秒開始，標準 6.6 秒。不能用平均誤差只增加 0.03 秒掩蓋個別句子的退步。專用核心與執行緒同時變更；沒有做完整歌曲逐項消融，因此不能判定字幕改變由哪一項單獨造成。

本次輸出位於 `.local/whisper-poc/song-perf-t6/`，包含可離線逐句播放的 `comparison.html`、兩份 SRT、`comparison.json` 及保留基線與全部校準證據的 `performance.json`。Chrome 實測共享 WASM heap 約 1.07 GB（不是整個瀏覽器的總記憶體），需納入低記憶體裝置考量。每個整曲條件一次測量，專用核心校準每條件兩次；這是本機本曲的實測，非跨裝置統計效能保證。

結論：速度改善成立，字幕品質接近但不等價，仍有既有的前奏對齊問題與第 6 句退步。可靠度分數：95%（限本曲與本機記錄）；其他歌曲、重複整曲計時和專用核心單執行緒整曲消融，可檢驗可推廣性與時間差異來源。
