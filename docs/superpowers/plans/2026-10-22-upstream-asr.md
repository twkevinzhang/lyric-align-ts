# 上游 ASR 流程對齊實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans after user approval. Work task-by-task; do not substitute missing upstream behavior with another algorithm.

**Goal:** 在瀏覽器 WASM／WebGPU、small.en、q4 限制內，移植上游英文 ASR 控制流程與 `pairing=auto, window=4, --no-vad` 歌詞配對。

**Architecture:** Transformers.js／ONNX Runtime 作模型執行層；自行實作上游的特徵、解碼控制、seek、ASR 詞時間及段落產生。以完成的 ASR segments 與 words 驅動上游 auto pairing 和 breath splitting，不再以高階 ASR pipeline 的重疊文字合併作為等價替代。

**Tech Stack:** 現有 TypeScript／React／Worker、Transformers.js 4.3.1；模型 `onnx-community/whisper-small.en_timestamped` revision `8085393831131554ad978a4e438295a734d3d2c0`；dtype q4。

**Spec:** 本文件「授權需求與等價範圍」。使用者已授權 Task 0 能力驗證；目前只有底層探測完成，產品程式、設定與模型尚未變更。結果見 [能力驗證](../../asr-capability.md)。

## 授權需求與等價範圍

- 只能在瀏覽器 WASM／WebGPU 執行，固定 small.en、q4；不使用其他 ASR 模型大小、精度或後端作驗證。
- 使用者已確認上游預設 `pairing=auto, window=4`，並維持 `--no-vad`。不額外載入 VAD 模型。
- 不把提供歌詞、人工參考或歌詞衍生 tokens 傳入 ASR。前次 ASR 自己產生的 tokens 可按上游規則作前文條件，來源須可追溯。
- 無已知歌詞聲學重對齊、Q25、固定偏移、人工補時或其他新增時間修整。
- 上游自身的 `word_timestamps=True`、attention／DTW、詞時間邊界處理及 breath splitting 屬此次移植範圍；不是先前被移除的已知歌詞重推論。若使用者禁止這些上游既有行為，必須重新確認需求，不能宣稱仍完整相符。
- 目標是控制流程、參數語意及配對演算法相符，不承諾 small.en/q4 與 medium/int8 或不同 runtime 的逐字、逐秒、浮點或隨機序列相等。
- 只檢查已保存的上游原始碼、輸出與 fixtures；不再執行 faster-whisper 或未量化模型。
- 既有上游 ASR 邊界規則必須明確列入實作與報告；不能以「改善品質」為由加入額外規則。
- WASM 和 WebGPU 為明確選擇的執行模式；未通過的模式不標示支援，也不自動換後端、精度、模型、beam 數或流程。
- 計畫以固定上游 lyric-align `ebe62d8a8628d0b2579987598f0442ebffcc68bb`、其已保存的 faster-whisper 1.2.1 行為為參考；不宣稱涵蓋未核對的新版本。

## 觀察事實與限制清單

| 項目                                      | 可行性與必要工作                                                                                                | 不可先行承諾的部分                                                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| auto pairing、window、字元相似度          | 純 TypeScript 可移植；auto 為行數／段數的 Python round，限制 1–3；多行以 breath splitting 分配 words            | 不能用 Math.round 代替 Python ties-to-even；不能以逐行輸出冒充 auto                                                        |
| 全曲特徵與 30 秒 seek                     | 可移植狀態機和特徵處理；取消固定 20 秒跳步及重疊文字合併                                                        | 內建 feature extractor 預設截成 3000 frames，需補寫或包裝；僅移除 128 上限不等價                                           |
| ASR 前文 tokens                           | 可按上游保留、截斷及 reset；與歌詞資料完全分離                                                                  | 英文模型 special-token ID 必須取自本模型，不能照搬 multilingual ID                                                         |
| beam search                               | generate() 尚未實作完整 beam；需自行實作候選擴展、分數、EOS、patience、length penalty 與 cache 管理             | 現有 q4 ONNX 能否在兩個後端可靠管理／重排各 beam cache，尚未實測；不得降成 greedy                                          |
| temperature fallback                      | 可移植 0、0.2、0.4、0.6、0.8、1.0 重試、best_of=5、選擇及 reset 規則                                            | 需要可用的分數與 no-speech probability；隨機抽樣不保證與 CTranslate2 同序列                                                |
| no-speech、avg logprob、compression ratio | 原始 logits 可由 forward 邊界取得；統計與決策可補寫。no-vad 不表示關閉 no-speech 判斷                           | generate() 的 scores/logits 輸出仍是 TODO；不能用被 suppression 修改後的機率或只看 EOS 猜測。zlib 壓縮結果與門檻邊界需驗證 |
| ASR 詞時間及段落邊界                      | q4 timestamped 模型曾在 WebGPU 輸出 cross attention；上游文字分詞、attention／DTW、標點合併及邊界規則可分層移植 | WASM 輸出能力與 CTranslate2 align 的演算法／數值差異未完整驗證；直接使用套件 word timestamps 不足以宣稱等價                |
| 音訊解碼與重採樣                          | 維持 16kHz、mono、Float32；模型前處理以共同 PCM fixtures 驗證                                                   | Web Audio 與上游 PyAV 解碼／重採樣不保證 bit-identical；如要求相同解碼器，需另案確認依賴與範圍                             |
| 最終辨識文字與時間                        | 可以保存每一步以判斷流程差異                                                                                    | 模型與數值後端不同，不能保證和保存的 medium 輸出完全相同；不能用品質目標掩蓋流程差異                                       |

## 目標流程

```text
音訊檔 → 16kHz mono PCM → 全曲 log-Mel（全曲正規化）
                              ↓
                 依上游 seek 取最多 30 秒 frames
                              ↓
                 ASR 前文 + small.en 原生 prefix
                              ↓
       temperature=0：beam=5；失敗則按上游 sampling fallback
                              ↓
         no-speech／logprob／compression 判斷
                              ↓
       timestamp 切段 → ASR 自身詞時間與邊界規則
                              ↓
        更新 seek／前文／reset → 直到完整音訊結束
                              ↓
         ASR segments + words（不接觸提供歌詞）
                              ↓
    歌詞 → auto pairing → window 4 字元搜尋 → breath splitting
                              ↓
            上游規則決定的行起訖／未匹配空值
```

## 檔案與責任

- `spike/app/lib/segment-alignment.ts`：auto、群組匹配及呼吸切分；保留現有相似度實作。
- `spike/app/lib/asr/features.ts`：全曲 log-Mel、frame 數、切片及 padding；不依歌詞切音訊。
- `spike/app/lib/asr/runtime.ts`：模型 encode／forward、原始 logits、cache、attention 與 tensor 生命週期；封裝版本相依 API。
- `spike/app/lib/asr/decode.ts`：beam、sampling、token masks、候選分數與停止條件。
- `spike/app/lib/asr/control.ts`：fallback、no-speech、前文、seek、timestamp 切段及有界進度檢查。
- `spike/app/lib/asr/word-timing.ts`：僅對 ASR 產生的文字執行上游詞時間與邊界規則。
- `spike/app/asr.worker.ts`：編排上述模組；ASR command 不含歌詞或人工參考。
- `spike/app/lib/protocol.ts`、`workflow.ts`、`routes/_index.tsx`、`scripts/evaluate-report.ts`：新結果／設定、backend 選擇、原始 segments+words、auto 決策與報告版本。
- 各模組對應 `*.test.ts`；更新 test script 以包含巢狀測試。能力探測與完整音檔資料只留 `.local/`，不提交歌曲文字、音檔或模型。
- `README.md`：只記錄最後實際完成的流程、通過的後端及仍存在的差異；不得提前宣稱完整支援。

## Task 0：底層能力與語意閘門

- [ ] 先固定需求、參考版本和來源規則對照表；逐項標記來源函式、參數與對應測試。補核對 CTranslate2 的 beam／score／align 定義，僅讀文件與原始碼，不執行該後端。
- [ ] 以現有 small.en/q4 在 WebGPU 與 WASM 各做能力探測：encoder reuse、原始 logits、no-speech token 機率、decoder cache 延續、候選 cache 獨立性／釋放、cross attention 及已生成文字 token 輸入。
- [ ] 兩步 cached decode 與相同模型的完整 prefix forward 比較，先訂數值容差與決策差異回報方式；交錯執行兩個候選，排除 cache 汙染。此測試只比較同一 q4 模型。
- [ ] 確認 beam=5 在指定硬體可正確運作；可評估依序執行候選以降低峰值，但不得減少搜尋候選或變 greedy。記錄實際時間／記憶體，無證據不承諾效能。
- [ ] 建立 timestamp masking、分數定義、ASR align 所需輸出的能力清單。無法取得任一必要輸出、能力不符或資源不足時，停止依賴它的工作並回報；不改模型／精度／搜尋策略，也不直接套用內建 pipeline 當替代。

**目前結果：** WASM／WebGPU 的原始 logits、encoder reuse、獨立候選及釋放隔離、attention 均通過；五候選32步資源探測通過。沒有完成長上下文／完整上游 beam 負載或 align 等價驗收，不得以短程探測宣稱完整 ASR 可行；尚未進入 Task 1–5。

**完成條件：** 每個後端均有實測能力報告，或具體列明失敗項；未解阻礙不進入相依實作。此階段可能證明目前套件／硬體不足，因此完整可行性尚不能保證。

## Task 1：移植與模型無關的配對及控制規則

- [ ] 先寫並觀察失敗測試：auto 1/2/3、空 segments、2.5 比例取偶數、末組不足行、breath 同分取較早、詞少於行、沒有 words 的上游 fallback、window 4 嚴格邊界及未匹配游標不前進。
- [ ] `alignSegments(segments, lyrics, pairing = "auto")` 實作上游 auto、stanzas、breath splitting。保留來源 segment／word 索引和解析出的 pairing；karaoke=false，不產生額外字符時間。
- [ ] 以已保存的上游 fixtures 和手工可核對案例驗證分數、配對、每行起訖及空值。擴增 fixtures 不需要執行 faster-whisper；若特定期望值無獨立依據，先補源碼推導，不能由待測程式產生答案。

**完成條件：** pairing=1 舊測試仍通過，auto 與 breath 的上游規則測試通過；詞時間尚未就緒前不接入正式頁面。

## Task 2：全曲特徵與自訂解碼層

- [ ] 固定 PCM 測試先驗證 frame 邊界、短音訊 padding、尾端、靜音、全曲 log-Mel 最大值正規化及恰好 30 秒邊界；不以每窗重新正規化代替全曲規則。
- [ ] 先用已知 logits 的微型候選樹測試 greedy 與 beam 不同答案、beam=5、EOS、patience、length penalty、同分規則與 cache 身分；再實作 runtime 和 decoder。不能僅傳 `num_beams: 5` 假裝已有 beam。
- [ ] 按小英文模型實際 tokenizer 設定 token IDs、blank／non-speech suppression、timestamp 單調及初始限制；不直接信任目前套件 timestamp processor 為完整上游實作。
- [ ] 以可控制亂數測試 sampling、best_of=5 及分數計算；記錄與上游隨機引擎不可等同的限制。詞機率／no-speech 使用定義正確的原始分數。

**完成條件：** 人工 logits 參考可重現所有候選／決策；同一 q4 模型 cache 測試與資源釋放測試通過。完整解碼器以前，正式 ASR 不換流程。

## Task 3：fallback、seek 與 ASR 詞時間

- [ ] 用固定解碼回應測試 no-speech 的 logprob 例外、compression ratio >2.4、avg logprob <-1、temperature 重試與最終選擇、前文截斷及 temperature>0.5 reset；精確移植來源規則與邊界條件。
- [ ] 測試連續 timestamp pairs、single-timestamp ending、未完成段落、詞尾更新 seek、尾端不足一窗及空輸出。相同輸入記錄每次 consumed frames，避免漏音訊或重複；無法前進時報告明確錯誤，不自行跳秒。
- [ ] 核對並移植 CTranslate2 align 所用 heads、正規化、median filter、DTW tie／邊界及 tokenizer 詞分組，使用可獨立核對的固定矩陣測試。
- [ ] 移植 faster-whisper `add_word_timestamps` 原有的標點、詞時間與 segment 邊界規則；各規則須有來源與測試，不加入舊 Q25 或已知歌詞對齊。
- [ ] 如無法核對／重現所需 align 定義或拿到必要 attention，先回報限制；不能以套件 `return_timestamps: "word"` 取代後宣稱相符。

**完成條件：** 以控制輸入驗證 seek／fallback／前文／words／segments 的決策一致；ASR 接口完全沒有提供歌詞入口。

## Task 4：整合與可檢查報告

- [ ] Worker 接入自訂 ASR 控制層，取消高階 pipeline 固定 overlap 路徑與額外 128 限制。預設值與長度語意按已核對的來源實作，不用另一個任意 token 數替代。
- [ ] ASR 完成後才傳給 auto/window4 配對器；資料流測試確認改歌詞不改 ASR 輸入與輸出，只改配對。
- [ ] 報告記錄 backend、模型 revision、q4、每輪 seek／frames、temperature、候選分數、logprob、compression、no-speech、前文來源／reset、原始 ASR token 時間、原有邊界處理後的 segments+words、auto pairing 與 breath 結果。
- [ ] 升級 schema，拒絕把舊 pipeline 報告當新流程；評分 CLI 從原始 ASR segments+words 重算，不能以人工參考修正結果。
- [ ] 頁面只提供已通過能力測試的 backend；中止、釋放與錯誤能清理所有候選 cache，失敗不自動降規格。

**完成條件：** 能由匯出資料追溯每個段落與行時間；無隱藏 fallback。必要 UI 只反映此方案，實作前提供具體草圖。

## Task 5：完整驗證與交付

- [ ] 執行完整 tests、lint、typecheck、build；核對正式 bundle 未包含本機素材與診斷捷徑。
- [ ] 在實際通過能力測試的 WASM／WebGPU，各以相同官方 Amazing Grace 與歌詞跑完整流程；另用原先 206.68 秒素材驗證長前奏失敗案例。每份資料核對 SHA-256。
- [ ] 記錄 WER、ASR 段落／詞數、auto 結果、匹配率、時間、記憶體與所有流程差異。現有上游保存結果僅為參考，不以 WER=0、12/12 或15/17當成必須調參達成的門檻。
- [ ] 歌詞変更不能改變同一音訊的 ASR；重複執行的 beam 結果檢查可重現性，sampling 差異與亂數來源明確記錄。
- [ ] 依同一來源規則逐條審查；有任何未移植之處就列為未完成，不以測試總數或相似輸出代替。
- [ ] 更新 README，保留一份最新限制表；按既有 make-git 規則建立提交。使用者已選擇交付時停止 dev server，沿用該選擇並驗證停止。

## Review Focus

1. beam 分支共享或錯誤釋放 KV cache，造成候選互相汙染：Task 0/2 交錯候選與資源測試。
2. 把歌詞當成 ASR 前文、或 no-vad 誤解成不做 no-speech：Task 3/4 來源與決策測試。
3. auto 的 ties-to-even、breath 少詞／空組等 Python 語意差異：Task 1 邊界案例。
4. 30 秒／尾端／未完成段落導致 seek 不前進或漏 frame：Task 2/3 消耗 frames 測試。
5. 直接採套件 word timestamps、分窗特徵或已改過的 logits 冒充上游：Task 0/2/3 能力、定義與來源核對。

## 尚不能承諾相符的部分

1. 現成 `pipeline()`／`generate()` 無法提供完整上游流程；完整移植需要自訂解碼與控制層，不是設定檔修改。
2. q4 匯出模型在兩後端的必要輸出與 beam cache 能力、資源需求尚未實測；只能在 Task 0 後決定能否繼續。
3. CTranslate2 align、解碼分數和 sampling 的精確語意仍需補核對；不能宣稱僅憑目前套件的同名 API 就相同。
4. 即使流程移植完成，固定 small.en/q4 與其他模型／後端的結果不可能作為 bit-identical 驗收目標。瀏覽器音訊解碼也不承諾和 PyAV 相同取樣值。
5. 若任一必要能力不能提供，先向使用者回報具體缺口；不得自動採 greedy、固定 overlap、缺詞時間、其他精度／模型／後端，或省略來源規則後仍稱為上游流程。

**可靠度分數：90%（原始碼差異、純控制邏輯可移植的判斷）；完整 q4 跨後端實作可行性目前無法判定。** 提升可靠度的驗證是 Task 0 的實測，以及解碼／align 定義逐項來源核對。模型輸出或 cache 能力不足將降低可行性判斷，而不是被忽略。
