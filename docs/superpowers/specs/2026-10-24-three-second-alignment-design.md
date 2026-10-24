# 目前歌曲對齊與發佈範圍

使用者已停止持續優化，接受量測結果，授權在 v1 發佈 1.0.1，並明確同意排除 TEN-VAD、接受準確率改變。六首測試均已獲授權。本文件取代研究階段不提交、不發佈及僅測三首的限制。

## 正式配置

瀏覽器 CPU／WASM、tiny Q5_1、8 執行緒；對齊預設為 1.5 倍 mel 時間壓縮、640-frame context、四區塊 encoder 注意力、openPrefix joint、posterior ends、lyric pauses。不包含 TEN-VAD、模型權重或歌曲。獨立 ASR 使用完整 encoder 注意力與 1500 context，結束後恢復對齊設定。

## 驗證口徑

- 公開 align() 的 metrics.operationSeconds 包括音訊準備、推論、Worker 往返、句子配對與 SRT；初始化、輸入取得及事後評分另計。
- 每首使用新建且已初始化的實例處理完整音訊；不快取歌曲輸出，不額外暖機。
- 參考時間只評分，SRT 作歌詞時先去掉時間；不硬編歌曲例外。
- 句首句尾分別計算全句 MAE 與嚴格 <1 秒的數量。缺失與無效端點算失敗，不排除離群值。
- 固定報告歌曲、句首誤差、句首 <1 秒、句尾誤差、句尾 <1 秒、耗時。
- 原雙邊 85% 與三秒條件尚未達成，使用者接受發佈不代表通過。六首數字見 docs/three-second-alignment-report.md。

## 發佈驗收

公開 API 與 contractVersion 保持 1；套件與 libraryVersion 為 1.0.1。完成原生重建、型別、單元、Chrome、session、tarball allowlist、獨立安裝與推論檢查。npm 包僅含 dist、README、package.json 與授權文件；不含 TEN-VAD、研究資產、歌曲、模型或秘密資訊。不得宣稱未執行的遠端動作成功。
