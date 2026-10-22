# lyric-align-ts

在桌面 Chrome 內以 **Whisper small.en q4＋歌詞提示＋全域順序配對**，產生英文歌曲的詞級時間與歌詞行對應。目前是技術驗證應用，程式位於 `spike/`。原始專案：[lyric-align](https://github.com/ijuinryukichi/lyric-align)。

## 執行

需要 Node.js 24、npm、桌面 Chrome 與可用的 WebGPU。

```sh
cd spike
npm ci
npm run dev
```

開啟 `http://127.0.0.1:5173/`，選擇音檔、提供每行一句且依演唱順序排列的英文歌詞，載入模型後按「開始全曲對齊」。可播放原音、展開逐詞時間、切換執行紀錄、匯出本機診斷 JSON，或中止與釋放模型。重新整理會清除結果。

首次載入從 Hugging Face 下載模型，之後可使用瀏覽器快取；音檔、歌詞與推論留在瀏覽器。開發伺服器提供檔案，沒有後端辨識或對齊服務。初次模型下載仍需要網路，不保證清除快取後離線可用。

## 固定主線

- Transformers.js **4.3.1**；模型 `onnx-community/whisper-small.en_timestamped`，revision `8085393831131554ad978a4e438295a734d3d2c0`。
- `device: webgpu`、`dtype: q4`；encoder 與 merged decoder 均載入 q4 ONNX，不自動切換精度或 CPU。GTX 1050 Ti 不要求 `shader-f16`。
- 單聲道 16 kHz、完整音檔；30 秒視窗、5 秒 stride、`max_new_tokens: 128`、`do_sample: false`、`no_repeat_ngram_size: 0`、詞級時間戳。英文專用模型不傳 `language`／`task`。
- 歌詞編碼後放入 Whisper previous-text 提示區，最多保留最後 224 個 context tokens；報告記錄完整與採用的 token 數。較長歌詞不會全部進入提示，但全篇仍用於配對。此處依賴固定版本的私有 generation API。
- 關閉 n-gram 抑制，避免抑制器將提示中的正確歌詞也禁止生成；保留上游原始時間，未套用時間修正候選。
- 英文正規化後以全域 Levenshtein 路徑取得完全一致詞的順序對應。行配對要求行首兩詞在 ASR 輸出連續一致、至少半行詞吻合、起點有效且不倒退。單詞行不滿足兩詞條件，保持未匹配。
- 原始 ASR 詞與時間完整保留，另列缺失、超界、零／負長度、倒序、重疊、重複異常。歌詞詞項保留來源索引；缺詞、替換或無效／超界時間以空值呈現，不插補。文字配對成功不表示時間準確。

僅驗證英文與桌面 Chrome；其他語言、手機與其他顯示卡未驗證。全域配對的時間與記憶體為 O(歌詞詞數 × ASR 詞數)，超長音訊與大量幻覺輸出可能增加負擔。

## 本機素材與人工參考

`.local/`、依賴目錄與建置產物由 Git 忽略。音訊、影片、完整歌詞、原始辨識文字與診斷報告只留本機，不提交公開 repository。

開發模式的「載入本機 Amazing Grace」讀取：

- `.local/test-media/amazing_grace/amazing_grace.m4a`
- `.local/test-media/amazing_grace/amazing_grace.txt`
- `.local/results/reference-map.json`（存在時才載入人工評分）

Production build 不包含本機素材按鈕或本機讀檔 middleware。也可用音檔選擇器與歌詞欄位處理其他素材。

參考 JSON 格式為 `{ "audioSha256": "…", "lyrics": ["…"], "references": [{ "lineIndex": 0, "start": 1.23 }] }`；行索引從 0 起算，缺少獨立時間時 `start` 為 `null`。參考必須對應同一音檔 SHA-256 與完全相同歌詞行，且只評分整首結果。人工時間不傳給辨識 worker 或配對函式。

本機 Amazing Grace 的人工核對 SRT 對應到 17 個可評分行起點；最終單詞行缺少獨立參考而排除。歌詞與 SRT 少量文字差異保留使用者歌詞檔，不擅改。行級時間參考無法驗證每個詞的起訖；未匹配行計入成功率分母，誤差分位數僅涵蓋已匹配行。

匯出 schema 3 JSON 含模型設定、音檔雜湊、每次歌詞快照、原始 ASR、行／逐詞對應、WER、時間異常、錯誤及 JS heap 採樣。中止與失敗紀錄不評分；CLI 會重新從原始輸出計算成功紀錄，不信任報告內快取的分析欄位：

```sh
cd spike
node scripts/evaluate-report.ts ../.local/results/main-path-report.json ../.local/results/reference-map.json
```

報告含歌詞與音訊衍生文字，應保存本機。更新素材後先重新核對參考對應。

## 驗證與限制

執行 `npm test`、`npm run lint`、`npm run typecheck`、`npm run build`。測試涵蓋重複歌詞、缺詞、無效／超界時間、提示截斷、人工參考隔離、成功率分母與報告重算／錯誤紀錄。

記憶體可用 Windows PowerShell 執行 `./spike/scripts/measure-chrome.ps1 -OutputName main-path-memory`，結果存於 `.local/results/`；結束採樣需停止該 PowerShell 程序。JS heap 不等於總 RAM 或 VRAM。此工具採樣全部 Chrome private bytes 與 Chrome GPU 程序記憶體，包含其他分頁；5 秒間隔可能漏掉瞬間峰值。`dispose()` 加上終止 worker 也不能保證驅動完全回收。

上游直接相關的時間戳、WebGPU、資源釋放與穩定性限制由本階段繼承。模型下載／初始化或推論失敗會顯示錯誤，可重新載入；不以其他精度或裝置重試。

## 目前全曲驗證結果

GTX 1050 Ti 4 GB、Chrome 155、NVIDIA Pascal adapter、`shader-f16: false`、WebGPU／q4。測試為 206.68 秒 Amazing Grace 完整混音，音檔 SHA-256 為 `138a911609554655a676e27499e532c23b2152e12f45d81f91acb0fef0ea04c1`。歌詞共 104 個英文詞項、121 context tokens，全部納入提示。

兩次重新載入模型後的全曲執行耗時 **45.03／44.52 秒**，不含模型下載、初始化及音訊解碼；一次經過中止、終止 worker 與重新載入後完成。兩次辨識文字與全部原始詞時間逐項相同。這是單曲重現性觀察，不是跨曲或穩定速度保證。

| 指標                            | 兩次共同結果                            |
| ------------------------------- | --------------------------------------- |
| 提供歌詞條件下的 WER            | 15.4%（14 替換、0 刪除、2 插入）        |
| 原始詞記錄                      | 106；3 個零長度詞，共 6 筆時間異常      |
| 歌詞詞項有效來源時間            | 89／104；僅代表有效配對，未驗證時間準確 |
| 人工可評分行匹配                | 14／17，3 行未匹配；另 1 行排除         |
| 行起點誤差 ≤0.5 秒／≤1 秒       | 0／17、5／17                            |
| 匹配行絕對誤差中位數／P90／最差 | 1.080／1.507／2.193 秒                  |

本輪 73 筆程序級採樣包含載入、推論、中止復原與釋放。Chrome GPU 程序專用記憶體峰值 **3237.3 MiB**，全部 Chrome private bytes 峰值 **6191.1 MiB**；釋放並終止 worker 後最後樣本為 **70.7 MiB／1206.4 MiB**。此數值包含其他 Chrome 分頁，不能視為本模型獨佔用量或完整洩漏驗證。原始採樣與摘要為本機 `.local/results/main-path-memory.jsonl`、`main-path-memory-summary.json`，採樣程序已停止。

本機最新彙總在 `.local/results/summary.json`，原始報告為 `main-path-report.json` 與 `main-path-recovery-report.json`。16 項測試、lint、typecheck、production build 通過；Chrome 載入、音訊預覽、中止復原、全曲執行、匯出與釋放已驗證，未觀察到瀏覽器錯誤。Production client 未包含本機素材路由或素材內容。

**結論：此主線能在指定硬體與純瀏覽器限制下重現文字改善，但目前的時間精度仍不足以宣稱逐詞卡拉 OK 可用。** 尚缺逐詞人工起訖真值及另一首未用於選參數的歌曲，才能驗證逐詞準確度與泛化能力。

保留自上游衍生的歌詞行解析邏輯，原始授權見 `spike/upstream.LICENSE`；目前全域順序配對不採用上游四段候選搜尋。
