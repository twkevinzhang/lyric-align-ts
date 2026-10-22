# lyric-align-ts

瀏覽器端 Whisper **small.en／q4** 歌詞對齊工具。可選 **WASM（單執行緒）或 WebGPU**；ASR 不接收歌詞。程式位於 `spike/`。

## 執行

需要 Node.js 24、npm 與桌面瀏覽器：

```sh
cd spike
npm ci
npm run dev
```

開啟 `http://127.0.0.1:5173/`，選擇音檔、輸入依演唱順序排列的英文歌詞，選後端並載入模型，再開始全曲對齊。可中止、釋放模型或匯出本機 JSON。首次需下載模型，音訊與歌詞留在瀏覽器，沒有後端推論服務。

## 流程與固定基準

```text
音檔 → 16kHz mono PCM → 全曲 log-Mel 正規化
                            ↓
               依 seek 取最多 30 秒特徵
                            ↓
      自訂 beam 5／sampling best_of 5 → fallback
                            ↓
      timestamp 段落 → ASR 詞時間 → 上游邊界規則
                            ↓
          更新 seek 與 ASR 前文，直到音訊結束
                            ↓
歌詞 → auto 群組 → window 4 字元配對 → 呼吸切分
                            ↓
                  行起訖／未匹配空值
```

- Transformers.js **4.3.1**，`onnx-community/whisper-small.en_timestamped`，revision `8085393831131554ad978a4e438295a734d3d2c0`，固定 q4。錯誤不會自動換模型、精度、後端或搜尋策略。
- 規則來源：[lyric-align ebe62d8](https://github.com/ijuinryukichi/lyric-align/tree/ebe62d8a8628d0b2579987598f0442ebffcc68bb)、faster-whisper **1.2.1**、CTranslate2 **4.8.3**。只執行瀏覽器 q4 模型；Python 原始碼用於純規則驗證。
- `pairing=auto`、`window=4`、`karaoke=false`、`--no-vad`。無初始提示、prefix、hotwords 或提供歌詞的入口；前文只來自 ASR 已產生且保留的段落 tokens。
- 自訂解碼器使用 beam=5、patience=1、length_penalty=1；溫度為 0、0.2、0.4、0.6、0.8、1。非零溫度各抽樣五個獨立候選。實作 blank／non-speech suppression、timestamp masks、EOS、token 上限與機率統計；不呼叫 `pipeline()` 或 `generate()` 代替。
- `max_length=448` 按 CTranslate2 的 context/start-step 語意計算生成上限，沒有額外 128-token 限制。no-vad 仍保留 no-speech 判斷；重試門檻為 compression ratio >2.4 或 avg logprob <−1，no-speech 門檻為 >0.6，依上游例外處理。
- compression ratio 使用固定 pako 3.0.2、`legacyHash: true` 與 canonical zlib 預設參數；不使用 Node／Chromium 修改版 hash 的壓縮長度。204 組 Python zlib 1.3.1 參考案例已核對。
- ASR 自身的詞時間包含指定 attention heads、有效 frames 正規化、文字軸 LayerNorm、median filter 7、DTW、英文詞分組、標點合併及 faster-whisper 原有邊界規則。這些只處理辨識文字，不對提供的歌詞重新做聲學推論。
- auto 以歌詞行數／ASR 段落數取 Python ties-to-even，限 1–3。群組由目前游標搜尋最多四段，字元相似度同分選較早者，嚴格通過門檻才前進；多行依詞間呼吸切分，缺 words 時沿用段落時間。
- 未匹配行保持空值。沒有全域詞序配對、歌詞提示、已知歌詞重對齊、Q25、插補或額外時間修整。不以任何指定匹配率作為調參目標。

## 報告與驗證

**schema 5** 記錄 backend、模型與設定、音檔及 PCM SHA-256、每輪 seek／有效 frames、候選 token 與分數、重試／選擇、ASR 前文來源及 reset、timestamp 原始段落、詞時間及段落形成、auto 群組與呼吸切分來源。舊 pipeline schema 4 不適用。中止／錯誤保留已收到的部分 trace，不冒充完成結果。

```sh
cd spike
npm test
npm run lint
npm run typecheck
npm run build
node scripts/compare-upstream.ts PYTHON UPSTREAM_SRC segments.json lyrics.txt auto
node scripts/evaluate-report.ts report.json reference-map.json
```

配對比較只執行上游純 Python 核心，不載入 ASR 模型。fixtures 包含既有 pairing 1 案例、120 組 auto、48 組呼吸分組、150 組切段／seek、80 組詞邊界案例。評分從保存的 ASR 重算；人工參考只評分，從不送入 ASR 或配對器。

最新實測範圍、數字與限制見 [ASR 驗證報告](docs/asr-capability.md)。匹配成功不等於時間正確，WER 也不能單獨驗證段落邊界。

## 仍存在的差異

模型／量化／ONNX runtime 固定為瀏覽器版本，不能保證與上游 medium 或 CTranslate2 浮點結果相同。Web Audio 與 PyAV 的解碼／重採樣也不承諾 bit-identical。

### 字詞時間：取得分數的方式不同

為判斷辨識出的字詞出現在音檔哪個位置，上游與目前版本取得資料的順序不同：

- **上游**取得原始分數，先排除為配合模型長度而補上的空白，再把剩下的分數換算成比例。
- **目前瀏覽器版**拿到的是已換算好的比例，只能先排除補上的空白，再將剩下的比例重新算成合計 100%。例如原本三個位置是 20%、60%、20%，最後一個是補上的空白；排除後，前兩個位置重新算成 25%、75%。這裡不會刪除歌曲原本的停頓。

精確計算時，兩種順序在數學上相同；但若工具交出資料前已捨去很小的數字，重新計算無法還原，可能造成字詞時間差異。目前沒有與上游同模型原始分數的直接對照，不能宣稱時間計算結果完全相同。遇到無法計算的資料會報錯，不以額外時間修整補救。這個步驟只使用 ASR 自己辨識出的文字，不會把使用者提供的歌詞送回模型。

已檢查固定 revision 的 q4 模型檔：原始分數仍在模型內部，但沒有列為可讀取的輸出。目前 Transformers.js／ONNX Runtime 的讀取方式只能取得模型開放的輸出，沒有直接取得這些內部分數的開關。增加模型輸出是可進一步驗證的方向，但尚未修改，也未驗證修改後能否在 WASM／WebGPU 正常執行。**目前保留上述重新計算比例的做法，不修改模型檔。**

### 其他執行差異

相同分數的 TopK 以 parent/token 排序；CTranslate2 裝置端同分順序沒有相同保證。sampling 使用瀏覽器 `Math.random()`，不保證與 CTranslate2 同一亂數序列。

五份 cache 以獨立 CPU 複本隔離；WebGPU 模式包含下載／上傳成本。張量統計不包含權重、runtime workspace、瀏覽器或驅動，也不是總 RAM／VRAM。低階 session／forward adapter 固定於套件版本，升級需重新驗證。

`.local/` 的模型、音檔、歌詞與完整辨識報告不提交。開發模式本機素材按鈕不包含於 production build。來源授權見 `spike/upstream.LICENSE` 與 `spike/asr-upstream.LICENSE`。
