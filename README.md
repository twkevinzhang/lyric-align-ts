# lyric-align-ts

在瀏覽器以 **Whisper small.en／WebGPU／q4** 獨立辨識音訊，再依上游 [lyric-align](https://github.com/ijuinryukichi/lyric-align) 的 **pairing 1、window 4** 規則配對歌詞行。程式位於 `spike/`。

## 執行

需要 Node.js 24、npm 與可用的 WebGPU。

```sh
cd spike
npm ci
npm run dev
```

開啟 `http://127.0.0.1:5173/`，選音檔、提供依演唱順序排列且每行一句的英文歌詞，載入模型後按「開始全曲對齊」。可播放音檔、展開匹配的 ASR 段落、切換執行紀錄、匯出診斷 JSON，或中止與釋放模型。重新整理會清除結果。

首次使用從 Hugging Face 下載模型，後續可使用瀏覽器快取。音訊、歌詞與推論留在瀏覽器，沒有後端推論服務；清除快取後不保證離線可用。

## 處理流程

```text
音檔 → 不帶歌詞提示的 ASR → 原生 ASR 段落
                               ↓
歌詞 → 字元模糊配對（pairing 1、window 4）
                               ↓
                   原始段落起訖／未匹配空值
```

- Transformers.js **4.3.1**，模型 `onnx-community/whisper-small.en_timestamped`，revision `8085393831131554ad978a4e438295a734d3d2c0`。固定 `device: webgpu`、`dtype: q4`，失敗不切換裝置或精度。
- 單聲道 16 kHz；30 秒推論視窗、5 秒 stride；`max_new_tokens: 128`、`do_sample: false`、`no_repeat_ngram_size: 0`。英文專用模型不傳 `language`／`task`。
- `return_timestamps: true` 回傳 Whisper timestamp tokens 定義、經套件合併重疊後的段落。30 秒視窗不是配對段落。此流程不要求詞級時間，也不產生逐詞卡拉 OK 時間。
- 歌詞不傳給辨識 Worker；ASR 完成後才使用當次歌詞快照配對。
- 每行由目前游標起搜尋最多 4 個段落，採上游正規化與 Python `difflib.SequenceMatcher` 相容的字元相似度，保留大小寫與預設 `autojunk` 行為。英文門檻為 **>0.50**；核心同樣保留上游 CJK 比例判斷與 **>0.25** 門檻，但 ASR 模型仍只適用英文。
- 同分保留最早候選；成功後游標移至選中段落下一段，失敗不前進。未匹配行保留空時間與候選分數。
- `pairing: 1`、`karaoke: false`：每行直接採所選段落的原始起訖，無歌詞提示、全域詞序配對、額外聲學重對齊、Q25 或其他時間修整。
- 缺少、零／負長度、超界、倒序與重疊時間只列為異常，不裁切、不修補。文字匹配狀態與時間有效性分開；段落若缺少邊界，行時間仍保留空值。

## 上游一致性驗證

配對語意以固定上游提交 [`ebe62d8a8628d0b2579987598f0442ebffcc68bb`](https://github.com/ijuinryukichi/lyric-align/tree/ebe62d8a8628d0b2579987598f0442ebffcc68bb) 為準，範圍為 `align(..., pairing=1, window=4, karaoke=False)`。未移植 `pairing auto`、多行呼吸切分、karaoke 或插補。

先將同一份 `segments.json` 與歌詞交給未修改的 Python 上游與 TypeScript，再逐項比較行文字、相似度、匹配狀態與起訖。已驗證官方 Amazing Grace 段落的 **12/12 行匹配、0 差異**；另一份本機素材的原始 ASR 只產生標點，雙方同為 **0/18 行匹配、0 差異**。此外，測試庫保留由固定上游產生的合成資料，涵蓋 38 組相似度與 12 組段落案例。

可針對自己的資料重跑（`UPSTREAM_SRC` 為固定提交中包含 `lyric_align/` 的 `src/`）：

```sh
cd spike
node scripts/compare-upstream.ts PYTHON UPSTREAM_SRC segments.json lyrics.txt
```

`PYTHON` 是 Python 執行檔路徑；此步只用上游純 Python 配對核心，不載入 Whisper。不相符時退出碼非零。`segments.json` 格式為上游的 `[{"start": 1, "end": 4, "text": "...", "words": []}]`。

瀏覽器與 faster-whisper 的模型、量化、推論與切段仍不同，因此核心一致不代表同一音檔的 ASR 結果或時間完全相同。驗收不以舊版 15/17 成績為通過門檻，也不為達成分數加入修整。

## 報告與人工參考

匯出 **schema 4** 診斷 JSON，包含固定設定、音檔 SHA-256、當次歌詞快照、原始 ASR chunks、段落分析、行配對與來源段落索引、獨立 ASR WER、時間異常、失敗紀錄及 JS heap。舊版詞級 schema 3 不適用。

評分指令會從原始 ASR 重算，不信任報告內快取的分析：

```sh
cd spike
node scripts/evaluate-report.ts report.json reference-map.json
```

參考格式為 `{ "audioSha256": "…", "lyrics": ["…"], "references": [{ "lineIndex": 0, "start": 1.23 }] }`，行索引從 0 起算，未知起點為 `null`。只評估完整音檔、相同雜湊與相同歌詞；未匹配行納入成功率分母，誤差統計只計已匹配行。人工參考不傳給 Worker 或配對函式；行起點參考不能驗證行尾。

`.local/`、依賴與建置產物由 Git 忽略。音檔、完整歌詞、原始辨識文字與報告只留本機。開發模式的本機素材按鈕讀取 `.local/test-media/amazing_grace/amazing_grace.m4a`、同目錄的 `amazing_grace.txt` 及可選的 `.local/results/reference-map.json`。Production build 不包含該按鈕或讀檔 middleware。

## 驗證與限制

目前內建 Chromium 155（NVIDIA Pascal adapter、`shader-f16: false`）的單次全曲實測：206.68 秒本機 Amazing Grace，推論約 25.20 秒，20 個原生段落、0 筆時間結構異常、ASR WER 69.2%、行匹配 **0/18**。前四段是誤辨識內容，均未達歌詞匹配門檻；依上游規則，失敗不前進游標，因此所有行都保持未匹配。將這次瀏覽器段落交給原版 Python 後，同樣得到 0/18，所有分數與結果零差異。這證明核心行為一致，並不表示目前 ASR 品質可用。

原始報告保留於本機 `.local/results/segment-browser-report.json`。另以 500 組相似度與 80 組段落案例執行 Python／TypeScript 差異比較，均為零差異。品質結果如實保留，不加入跳段、降低門檻或時間修整。

```sh
cd spike
npm test
npm run lint
npm run typecheck
npm run build
```

測試涵蓋上游相似度與配對結果、window 邊界、同分／重複行、單詞行、嚴格門檻、原始段落起訖、歌詞標記清理、時間異常、參考隔離、評分分母及報告重算。

模型下載、初始化或推論失敗會顯示錯誤；可中止、釋放與重新載入。JS heap 不等於總 RAM 或 VRAM，`dispose()` 與終止 Worker 不保證驅動完全回收。其他語言、手機、跨顯卡與跨曲品質未完整驗證。

字元相似度、段落配對與歌詞解析衍生自上游 MIT 授權程式，授權見 `spike/upstream.LICENSE`。
