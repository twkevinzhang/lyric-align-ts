# small.en／q4 ASR 驗證

目標：瀏覽器 WASM（單執行緒）／WebGPU，small.en、q4、auto／window 4、no-vad。正式 Worker 已接入自訂解碼／控制／詞時間流程，沒有 pipeline／greedy 替代、歌詞提示或額外時間修整。

## 已直接驗證

- 兩後端原始 logits（51,864 維）、SOT no-speech probability、encoder 重用、獨立 cache、交錯候選／釋放隔離、12 層 cross attention 與 19 個指定 heads 可用。
- 兩後端的 448-token context、五份獨立 cache 負載通過；第一及第五分支與完整 prefix forward 比較，argmax 相同，逐項均符合 `abs(error) <= .002 + .002*abs(reference)`。WebGPU 最大誤差 0.00002432；WASM 0.00001812。encoder 各 1 次，結束追蹤張量 0。
- 完整 context 負載的已追蹤張量峰值各為 1,346,356,736 bytes（約 1,284 MiB）。這是 wrapper 追蹤的張量儲存量，可能含別名；不含權重、runtime、瀏覽器與驅動，不是獨佔 RAM／VRAM。
- 全曲特徵以獨立 NumPy 來源計算核對短音訊、1 秒、恰好 30 秒、30 秒加尾端的選定點；最大誤差約 4.77×10⁻⁷。正規化只做一次，encoder 尾段排除最後 STFT frame 後補零。
- 上游純函式 fixtures：120 組 auto、48 組呼吸分組、150 組 timestamp 段落／seek、80 組詞邊界，另保留 pairing 1／字元相似度案例。沒有執行 faster-whisper 或未量化模型。
- 自訂解碼測試包含非 greedy 路徑、EOS、五候選抽樣、原始分數、224-step 上限、timestamp masks、RNG=0、不前進 seek 及候選錯誤清理。
- compression ratio 使用 pako 3.0.2 `legacyHash:true`，以 204 組 Python canonical zlib 1.3.1 參考案例核對，Node／瀏覽器均通過。Node／Chromium 的修改版 hash 會改變壓縮長度，不可用於此控制規則。[pako 選項定義](https://nodeca.github.io/pako/interfaces/DeflateOptions.html#legacyhash)

## 全曲驗收狀態

尾端 padding 與 canonical zlib 統計已修正，正在重新執行同素材完整驗收；目前不將修正前的全曲數字視為最終結果。原始 Worker output 自帶當次模型／設定，評分工具拒絕只有外層設定、無原始設定來源的報告。

目前已完成正式 Worker 的官方素材 WebGPU：6 段、76 詞、WER 12.0%、auto=2、12/12 行匹配、6 輪 seek／0 次重試；推論 160.62 秒（不含模型載入與音訊解碼）。將保存的每輪回應交給抽出的 Python 原始控制函式重播，prompt／fallback／no-speech／timestamp 切段／詞邊界／seek／前文皆零差異；同一 segments 交給上游 auto 配對也零差異。其他三組仍在驗收。

素材固定：官方 Amazing Grace 130.29875 秒，SHA-256 `834b463be93a8b19d05a72e94c429ab3618691aeb593869f603f58d22a8c7676`；原始素材 206.68 秒，SHA-256 `138a911609554655a676e27499e532c23b2152e12f45d81f91acb0fef0ea04c1`。歌詞只在 ASR 完成後計算 WER 與 auto 配對。沒有必須達成的品質數字。

## 規則來源與可追溯性

- [lyric-align ebe62d8 anchor.py](https://github.com/ijuinryukichi/lyric-align/blob/ebe62d8a8628d0b2579987598f0442ebffcc68bb/src/lyric_align/anchor.py)、`breath.py`：auto、群組、window、門檻、呼吸。
- [faster-whisper 1.2.1 transcribe.py](https://github.com/SYSTRAN/faster-whisper/blob/v1.2.1/faster_whisper/transcribe.py)：fallback、prompt、seek、word／segment 邊界；同版本 tokenizer／feature_extractor。
- [CTranslate2 4.8.3 whisper.cc](https://github.com/OpenNMT/CTranslate2/blob/v4.8.3/src/models/whisper.cc)、[decoding.cc](https://github.com/OpenNMT/CTranslate2/blob/v4.8.3/src/decoding.cc)、`sampling.cc`、`dtw.cc`、`median_filter_cpu.cc`：mask、no-speech、長度、分數、候選、align。

報告 schema 5 保留每次 seek、候選／完成分數、溫度重試、前文 token 索引、reset、原始 timestamp 段落、attention 路徑與 ASR 詞／段落形成；歌詞沒有進入 ASR 的資料欄位。

## 尚不能宣稱相同的部分

固定瀏覽器模型／q4、音訊解碼、數值 runtime、TopK 同分順序與 sampling RNG 不同；不保證辨識文字／浮點時間與 CTranslate2 bit-identical。ONNX attention 的有效 frames 重正規化有數學依據，但未取得同模型的 CT2 raw-QK 數值對照；這是明確限制，不以同名 API 當成等價證明。手機、其他硬體／瀏覽器與跨曲品質尚未驗收。

本機證據：`.local/results/asr-port-*.json`、`.local/results/asr-port-memory.jsonl`；重現工具 `.local/asr-capability/`。音檔、歌詞、模型與完整報告只留本機。dev server 交付前停止。

可靠度分數：95%（已測能力／純規則）；完整全曲交付仍待修正後實測。可提高可靠度的方式是完整兩後端同素材測試、保存 trace、以同一 segments 與上游純配對器比較，並如實記錄未通過項目。
