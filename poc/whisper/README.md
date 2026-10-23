# whisper-small CPU / WASM 數值 PoC

獨立實驗，不接入 `spike/` 的 ONNX 主線。目標是相同 Echogarden fork、模型、Mel 與 token 輸入，在原生 CPU 和瀏覽器 WASM 產生相同維度、容差內的 logits 與 cross-attention QK。

## 固定條件

完整來源與雜湊在 `lock.json`：

- Echogarden `echogarden-fork` commit `ca0598eb272bf3ef16f8163ab0bd98503803dee8`，未修改其運算核心。
- 多語 `ggml-small-q5_1.bin`，190,085,487 bytes；不是 `small.en`。模型 SHA-256 為 `ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb`。
- Emscripten 4.0.22 Docker image 以 digest 固定；同一映像內 GCC 11.4 編譯 Linux x64 原生程式。原生 CPU 運算發生在 Docker Desktop 的 Linux VM，不是 Windows N-API binary。
- CPU、1 個推論執行緒、GPU 與 flash attention 關閉、`WHISPER_AHEADS_SMALL`（10 heads）。WASM 啟用 SIMD128 與 pthreads；即使只用一個推論執行緒仍需要 COOP／COEP。
- 80 × 3000 的合成 Mel，xorshift32 固定 seed，float32 little-endian。沒有音訊解碼、取樣率轉換或 tokenizer 差異。
- 英文／中文特殊 token 前綴、固定合法 token IDs 100／200／300、逐 token 解碼，以及 `nPast=0` 重設。這些數字不是自然語言測試句，也不驗證 tokenizer。
- logits 取最後一個輸入 token 對應的下一 token 分數，維度 `[51865]`。QK 為縮放後、softmax 前的 `[heads, tokens, frames]`，預期 `[10, N, 1500]`。
- 每個元素都須滿足 `abs(wasm - native) <= 0.001 + 0.001 * abs(native)`。這是事先固定的工程門檻，不代表字幕時間品質的容許誤差。另報最大／平均絕對誤差、RMSE、超標數與位置。

## 重現（Windows PowerShell）

需要 Git、Node.js 24+、Docker Desktop Linux containers、Chrome。所有命令從 repository 根目錄執行。

```powershell
# 下載、驗證 hash，建置原生與 WASM；已有的來源／模型不覆寫
./poc/whisper/setup.ps1

# 原生推論：每次執行均重新驗證來源與模型，產生新的 run 目錄
node poc/whisper/native.mjs
node --test poc/whisper/compare.test.mjs poc/whisper/outputs.test.mjs

# 只綁定 loopback，提供 COOP/COEP；Ctrl+C 停止
node poc/whisper/serve.mjs
```

在 Chrome 開啟 `http://127.0.0.1:5174/`，按「執行 WASM 比較」，等待頁面顯示完成。另開終端執行：

```powershell
node poc/whisper/report.mjs
# 現有主線回歸測試
node --test spike/app/lib/*.test.ts
```

`report.mjs` 數值不通過時 exit 1；來源、維度、輸入雜湊不符合也會失敗。不要靠放寬容差將失敗改成通過。

模型、來源 checkout、編譯產物、原始 tensor 與報告都在 Git 忽略的 `.local/whisper-poc/`。最新比較報告是 `report.json`；`latest-native.txt`／`latest-browser.txt` 指向各自完整執行的原始資料。頁面只將合成測試結果寫回本機，不上傳外部服務。

## 橋接與範圍

`bridge.cpp` 提供初始化／釋放、encoder、decoder、logits 指標、QK 維度與複製介面。原生 runner 與 WASM 共用這份橋接。瀏覽器 application Worker 直接呼叫匯出函式，在每次 decode 後複製輸出，避免後續運算或 WASM memory growth 使舊 view 失效；完成後釋放 context 並終止 Worker。

此 fork 的 legacy decode 僅填入最後 token 的 logits，但 buffer 按 `tokenCount × vocabSize` 配置。多 token prefill 必須跳至最後一列。直接照搬 N-API 包裝的起始位址讀取會在首次 prefill 得到全零；`outputs.test.mjs` 專門防止這種假一致。

以上合成張量測試不產生字幕，不驗證真實歌曲精度、完整語言能力、長音檔、取消操作或記憶體洩漏。實際歌曲對齊與 SRT 比較另見 [`song/README.md`](song/README.md)，目前共用 Node.js 官方解碼／DTW，模型推論可交由 Chrome WASM 執行。報告中的 WASM heap 是線性記憶體容量，不是 Chrome 總 RAM 或峰值。合成測試原生時間包含 Docker 啟動、載入和輸出；瀏覽器 elapsedMs 不含模型下載，但包含初始化及結果傳回，兩者不能當成公平效能 benchmark。

## 實測狀態

Windows Chrome 155、上述鎖定輸入：5 個 decode 步驟的 logits／QK 維度均符合預期，所有元素有限；10 組 tensor 數值比較均未通過預設容差。AVX2 原生組對 WASM 最大絕對差為 logits `0.5036404133`、QK `0.7654447556`。失敗結果保留於 `.local/whisper-poc/report.json`，不可視為數值等價。

Chrome 單執行緒 encoder `148.45` 秒；包含初始化、解碼與傳回結果共 `151.21` 秒（不含下載）。WASM 線性記憶體容量 `1,066,991,616` bytes。這是合成輸入的一次觀察，不是實際音訊處理速度或記憶體峰值。

提供關閉 SSE4.2／AVX／AVX2／FMA／F16C／BMI2 的原生診斷組，用來檢查架構運算路徑對差異的影響。它不改模型、輸入、推論選項或容差，也不覆蓋主要報告：

```powershell
$image = (Get-Content poc/whisper/lock.json -Raw | ConvertFrom-Json).buildImage
& 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' run --rm -v "${PWD}:/work" -w /work $image bash poc/whisper/build-portable.sh
node poc/whisper/native.mjs --portable
node poc/whisper/report.mjs --portable
```

診斷結果輸出至 `.local/whisper-poc/report-portable.json`。此組仍可使用 x86-64 基礎 SSE2／編譯器最佳化，不能稱為完全 scalar 或與 WASM 相同指令序列。

實測診斷組同樣為 0／10 通過，最大絕對差為 logits `0.2931270599`、QK `1.3820075989`；原生完整執行約 `157.17` 秒。因此，關閉這些加速選項不足以消除差異，尚不能將原因單獨歸因於 AVX。逐層定位結果見下方；這些差異是否影響真實音訊的文字與時間，仍未驗證。

比較器 4 項測試、原生輸出有效性 1 項測試、既有 ONNX 主線 16 項測試通過。這些工具／回歸測試通過與跨平台數值比較失敗是不同的驗收結果。原生與 WASM 均建置成功；既有前端未改動，本輪未執行其 lint、typecheck 或 production build。

## Encoder 逐層診斷

診斷版保留 `lock.json`、模型、Mel、token 序列與容差。`instrument.mjs` 從固定 commit 的 Git object 產生獨立 `source-trace`，只加入張量名稱與 scheduler 觀測 callback，不替換數學運算。原始 `source` 與基準建置保持獨立。

```powershell
./poc/whisper/setup-trace.ps1
node poc/whisper/native.mjs --trace
node poc/whisper/serve.mjs --trace
# Chrome 開啟 http://127.0.0.1:5174/ 並執行，完成後另開終端：
node poc/whisper/trace-report.mjs
```

診斷捕捉輸入 Mel、conv1／conv2 的卷積與 bias／GELU、位置編碼、12 個 encoder block 輸出、最終 encoder 輸出，並細分 block 0 的正規化、Q／K／V 投影、attention 與 FFN。每個觀測點在運算完成且 buffer 尚未被重用時複製，按 stride 轉為 row-major float32；維度使用反轉的 GGML 四維順序。自動衍生的 reshape／transpose 別名不重複擷取。

`trace-report.json` 先比較最終 encoder，再依圖執行順序找第一個不符合**原容差**的觀測點，記錄超標元素數與比例、最大絕對差、RMSE、最差元素兩端值。這裡的「第一個」限於實際觀測點，不代表已證明某一條 CPU 指令有錯。

報告同時檢查兩端診斷版與各自未插樁基準的全部 logits／QK SHA-256。只有 `instrumentationPreservedOutputs: true` 才能宣稱診斷掛鉤未改變這組輸入的最終輸出。`instrumentation.json` 記錄原始來源、插樁來源與 callback 的雜湊；兩端必須相同。

診斷產物使用獨立 `latest-native-trace.txt`／`latest-browser-trace.txt` 指標，不覆蓋原始比較報告。擷取會增加時間與記憶體，不用於效能 benchmark。

### 固定輸入實測結果

39 個觀測點的維度、dtype、運算順序兩端一致且元素有限。兩端插樁版共 20 份 logits／QK 均與各自基準 SHA-256 相同，`instrumentationPreservedOutputs: true`。原生 run 為 `aedcd8f6-3518-4e8e-b9ea-b57232f8a2d2`，Chrome run 為 `c762119e-5c0b-4dd1-a23e-48f22e7b21ab`。

| 觀測點 | 最大絕對差 | 超差元素比例 |
| --- | ---: | ---: |
| Mel | 0 | 0% |
| conv1 卷積 | 0.000000476837 | 0% |
| conv2 GELU | 0.001953125 | 0% |
| 位置編碼相加 | 0.001953125 | 1 / 1,152,000 |
| block 0 輸出（第 1 層） | 0.02356166 | 12.1595% |
| block 1 輸出 | 0.02327564 | 39.9567% |
| block 5 輸出 | 0.06266922 | 66.8055% |
| block 6 輸出 | 10.86378479 | 71.3238% |
| block 11 輸出 | 10.90278625 | 90.3049% |
| 最終 encoder `[1,1,1500,768]` | 2.73404026 | 90.5560% |

最終 encoder RMSE 為 `0.01946009`。第一個超出既定 `0.001 + 0.001 × abs(native)` 容差的觀測點是位置編碼相加，row-major index `760173`（frame `989`、channel `621`，均從 0 起算）：

| 同一位置 | 原生 | WASM |
| --- | ---: | ---: |
| conv2 bias 後、GELU 前 | 1.83544921875 | 1.8354490995407104 |
| conv2 GELU 後 | 1.775390625 | 1.7734375 |
| 位置編碼相加後 | 0.78955078125 | 0.78759765625 |

GELU 前差 `1.1920928955078125e-7`，GELU 後放大為 `0.001953125`。位置相加沒有增加此點差值，但原生值縮小使容差降為 `0.00178955078125`，首次超差。此 fork 的 `ggml-cpu/vec.h` 啟用 `GGML_GELU_FP16`，F32 GELU 會先轉 FP16 再查表；原生輸入恰為相鄰 FP16 值 `1.8349609375` 與 `1.8359375` 的中點，WASM 略低於中點，與跨越捨入門檻造成的放大相符。

結論是 encoder 已有偏差，最早可見微差在 conv1，最早容差失敗在位置相加，第 1 個 block 已廣泛超差。尚未證明最初卷積微差的具體指令來源，也未細分 block 6 的大幅跳升；不得將查表門檻解釋為全部後續差異的唯一原因。完整逐點指標見 `.local/whisper-poc/trace-report.json`，最早超差點的前後值另存 `trace-first-point.json`。模型、輸入、參數與容差均未調整，ONNX 主線未修改。
