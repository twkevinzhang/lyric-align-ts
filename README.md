# lyric-align-ts

目標是在桌面 Chrome 執行 Whisper 模型推論，讀取音檔與歌詞並輸出字幕。

預設目標模型為多語 whisper-small。目前獨立 CPU／WASM 實作位於 [poc/whisper](poc/whisper/README.md)，歌曲對齊的建置與操作見 [song/README.md](poc/whisper/song/README.md)。

既有 `spike/` ONNX／WebGPU 主線保留，尚未遷移至多語模型。WASM 模型推論在 Chrome，tokenizer、解碼控制與 DTW 仍由 Node.js 執行，尚非完整純瀏覽器產品。

跨平台張量數值等價與歌曲對齊準確性仍有未解決問題，不應視為已可正式使用。測試結果僅由工具按需產生於 Git 忽略的 `.local/`，不保存於文件。
