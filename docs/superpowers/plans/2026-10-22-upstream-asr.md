# 上游 ASR 規則移植計畫與驗收狀態

## 固定範圍

- 基底分支 `codex/upstream-segment-pairing`，從 b49f910 建立；本次從 6d08787 繼續。
- small.en／q4、瀏覽器 WASM（單執行緒）／WebGPU；auto／window 4、no-vad、karaoke=false。
- 不執行 faster-whisper 或未量化模型。以 lyric-align ebe62d8、faster-whisper 1.2.1、CTranslate2 4.8.3 的原始碼及純規則 fixtures 核對。
- 不加入歌詞提示、全域配對、已知歌詞聲學重對齊、Q25、插補或其他額外時間修整。不為品質目標改規則。
- 不能提供必要能力時停止相依工作並報告，不自動替換 greedy、pipeline、模型、精度或後端。

## 實作順序與目前狀態

1. **底層能力閘門：通過已測範圍。** 原始 logits、encoder 重用、獨立 cache／釋放、attention；兩後端另通過五份 cache、448 context 的資源／完整 prefix 數值比較。張量峰值不等於總 RAM／VRAM。
2. **純規則：已實作並測試。** auto 的 Python ties-to-even、群組字元配對、呼吸切分、window4；fallback、no-speech 例外、ASR 前文截斷／reset、timestamp 切段與 seek。fixtures 來源與重建腳本保留於 `spike/scripts/`，不執行 ASR backend。
3. **自訂解碼：已實作並測試。** beam5、patience1、length penalty1、sampling best_of5、token masks、原始機率統計、EOS、CT2 長度語意、候選 trace、cache 隔離與錯誤清理。沒有內建 pipeline／generate 替代。
4. **詞時間與段落：已實作並測試。** 全曲特徵正規化、有效 frame slicing／padding、指定 heads、有效 frames attention 重正規化、LayerNorm、median7、DTW、詞分組、標點及上游原有邊界規則，再更新 seek／前文。只處理生成的 ASR 文字。
5. **整合：已接入，最終驗收進行中。** Worker、WASM／WebGPU 選擇、auto 配對、schema5、PCM／音檔 SHA、seek／候選／重試／前文來源／段落形成。舊 schema4 不接受為新流程結果。
6. **交付閘門：待完成。** 修正後官方130秒與原始206秒音檔在兩後端的完整測試、同 segments 上游零差異比較、正式頁面／匯出／中止與清理、重複 beam／歌詞隔離、最終 tests／lint／typecheck／build、文件更新及提交。

## 檔案責任

- `segment-alignment.ts`：auto、群組、字元搜尋、呼吸與來源索引。
- `asr/features.ts`：全曲特徵與有效 frame 視窗。
- `asr/runtime.ts`：固定套件版的 session／forward、原始 logits、cache、attention 與張量生命週期。
- `asr/decode.ts`：候選搜尋／抽樣／分數／token masks／完成條件。
- `asr/control.ts`：fallback、前文、timestamp 段落與 seek 純規則。
- `asr/word-timing.ts`：ASR 詞時間及段落邊界；`rounding.ts` 保留 Python 小數 round 語意。
- `asr/transcribe.ts`：完整控制迴圈及每輪追溯紀錄，沒有歌詞輸入。
- Worker／protocol／workflow／頁面／評分 CLI：介面與 schema5 整合。

## 來源限制與裁定

ONNX 是 post-softmax attention，裁切後以有效 frame 機率和重正規化；數學上對應裁切 QK 後 softmax，不宣稱逐浮點相同。遇到無法恢復的零值、非有限值或零變異時報錯。TopK 同分以 parent/token 穩定排序；sampling 使用 Math.random，與 CT2 的同分／亂數序列不保證一致。Web Audio 與 PyAV 解碼也不承諾相同 PCM。

cache 使用獨立 CPU 複本，WebGPU 會有傳輸成本。只承諾實測素材／硬體／瀏覽器，不把短程能力探測或匹配分數當成通用效能保證。

## Review Focus

1. 候選共享／錯誤釋放 cache 導致汙染。
2. 歌詞漏入 ASR 前文，或 no-vad 被誤解為關閉 no-speech。
3. Python ties-to-even、呼吸少詞／空組／切片語意。
4. 30 秒與短尾段的特徵／seek 邊界，不前進時明確報錯。
5. attention、分數、全曲特徵與上游詞邊界，不能以套件同名 API 取代核對。

最新測量與實際未完成範圍以 `docs/asr-capability.md` 為準。交付前沿用使用者「停止伺服器」的選擇，不重問。
