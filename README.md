# lyric-align-ts

本專案的目標是在桌面 Chrome 內執行 Whisper 模型推論，閱讀音檔及歌詞後，能夠輸出時間準確的字幕檔

## 預設值

|  項目  |  lyric-align-ts |  原因  |
|---|---|---|
| 預設模型 | whisper-small  |測試環境能力有限   |

## CPU／WASM PoC

獨立實驗位於 [`poc/whisper/`](poc/whisper/README.md)，固定 Echogarden fork、多語 `small` Q5_1 模型及合成 Mel／token 輸入，比較原生 CPU 與 Chrome WASM 的 logits、cross-attention QK。

目前兩端可執行且維度一致，但 AVX2 原生 CPU 與 WASM 的數值比較未通過預設容差。逐層診斷確認 encoder 已有差異：最早超差在位置編碼相加，前一個 conv2 GELU 將微差放大，第 1 個 encoder block 結束時約 12.16% 元素超差。尚不能宣稱推論數值等價或字幕時間準確。重現方式、適用範圍及實測結果見 PoC 說明。

現有 `spike/` ONNX／WebGPU 主線暫時保留，仍使用舊的英文模型設定，尚未遷移至本專案預設的多語模型。

實際歌曲測試位於 [`poc/whisper/song/`](poc/whisper/song/README.md)：以 Amazing Grace 完整音檔、已知歌詞和標準 SRT 比較官方 Echogarden 與 Chrome WASM。兩端共用官方歌詞對齊演算法，WASM 模型推論在 Chrome、控制與 DTW 暫在 Node.js；尚非完整純瀏覽器移植。目前改善版修正 GGML 的 WASM 架構選擇並採 6 個計算執行緒，整曲由 722.29 秒縮短至 143.17 秒；官方同為 6 執行緒耗時 43.84 秒。12 句中 7 句起訖時間與官方完全相同，句尾平均誤差為 WASM 1.2333 秒／官方 1.2033 秒；第 6 句 WASM 比官方提早結束 0.60 秒，兩端第一句都提早 6.6 秒。模型、音檔、歌詞與其他推論參數不變；仍不能宣稱所有音訊或數值等價。完整比較、Worker 分工與重現方式見歌曲測試說明。
