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

## 診斷

跨平台數值等價尚未達成。需要逐層診斷時，執行 setup-trace.ps1，再以 native.mjs --trace、serve.mjs --trace 與 trace-report.mjs 重新產生結果。固定容差不應為通過測試而放寬。
