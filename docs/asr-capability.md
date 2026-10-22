# small.en/q4 ASR 能力驗證

本報告對應「先做能力驗證」的授權範圍；正式 ASR、模型、配對設定與頁面沒有修改。規劃目標仍為 WASM／WebGPU、small.en、q4、pairing=auto、window=4、no-vad。現有產品程式尚未實作 auto 或新的 ASR 控制層。

## 已驗證的觀察

模型固定 `onnx-community/whisper-small.en_timestamped`，revision `8085393831131554ad978a4e438295a734d3d2c0`，Transformers.js 4.3.1，dtype q4。硬體為 GTX 1050 Ti 4 GB；瀏覽器 Chromium 155。WASM 使用單執行緒，WebGPU 使用 NVIDIA Pascal adapter；未執行 faster-whisper 或未量化模型。

使用官方 Amazing Grace 音檔前 30 秒作模型輸入，原檔 SHA-256 為 `834b463be93a8b19d05a72e94c429ab3618691aeb593869f603f58d22a8c7676`。沒有歌詞或人工參考進入探測 Worker。模型權重保持 q4；logits、attention 和 cache 使用模型匯出的 float32 張量，沒有切換成未量化權重。

| 檢查                                     | WebGPU                                     | WASM                   |
| ---------------------------------------- | ------------------------------------------ | ---------------------- |
| 原始 logits                              | 51,864 維，全部 finite                     | 51,864 維，全部 finite |
| SOT 後 no-speech 機率                    | 0.19661433                                 | 0.19661623             |
| encoder 重用                             | encoder 執行 1 次，後續只傳 hidden states  | 相同                   |
| 獨立候選 cache                           | 無相同 tensor 參照；交錯候選通過           | 相同                   |
| 釋放 A 後 B 繼續推論                     | 與完整 prefix 比較通過                     | 相同                   |
| cached／完整 prefix 最大 logits 絕對誤差 | 0.0000171661                               | 0.0000219345           |
| 上述比較的 argmax                        | 全部一致                                   | 全部一致               |
| cross attention                          | 12 層，19 個設定 heads 可取得；輸出 finite | 相同                   |
| ASR 自行產生文字 tokens 的 forward       | 通過，可取得 12 層 attention               | 相同                   |
| 五候選、32 步資源探測                    | 35.78 秒                                   | 68.85 秒               |
| 結束時五份 cache 張量儲存                | 539.30 MiB                                 | 539.30 MiB             |
| 最終清理                                 | 追蹤張量 0、清理錯誤 0                     | 相同                   |

數值判準事先固定為每項 `abs(error) <= 0.002 + 0.002*abs(reference)`，且 argmax 必須相同；實際誤差遠小於此界限。這些比較在各自後端內進行，不以 WebGPU 和 WASM bit-identical 為要求。

候選測試為從 raw logits 擴展、合併候選後保留五個分支，包含同一 parent 分出多個 child；各 cache 複製到獨立 CPU 儲存，WebGPU 推論包含下載／上傳成本。未使用上游 timestamp masks、EOS 完成條件、patience 或 length penalty，因此只是底層分支與資源能力測試，不是完整上游 beam 解碼器。

## 資源測量的範圍

作業系統約每 2 秒採樣全部 ChatGPT／Chrome／Codex／Edge 程序，包含其他視窗，不能視為本模型獨佔 RAM／VRAM。以下數字對應最後有效探測的時間區間：

| 採樣值                              | WebGPU     | WASM       |
| ----------------------------------- | ---------- | ---------- |
| 測試前程序 private bytes 合計       | 10,221 MiB | 10,295 MiB |
| 測試期間程序 private bytes 合計峰值 | 14,506 MiB | 13,482 MiB |
| 測試前程序 GPU dedicated 合計       | 258 MiB    | 262 MiB    |
| 測試期間程序 GPU dedicated 合計峰值 | 1,556 MiB  | 286 MiB    |

CPU cache 複製、臨時緩衝區和 GC 也會影響峰值。539.30 MiB 是結束時 cache 張量的確切儲存量，不是整個推論的峰值。按同一 cache 維度估算，448-token context 的五份 cache 約 684.84 MiB，但這只是儲存估算，未計模型、attention、runtime workspace、複製暫存、瀏覽器與驅動；沒有以 448-token 負載實測。

## 對上游來源定義的核對

只讀取固定 [CTranslate2 v4.8.3 whisper.cc](https://github.com/OpenNMT/CTranslate2/blob/v4.8.3/src/models/whisper.cc) 與 [decoding.cc](https://github.com/OpenNMT/CTranslate2/blob/v4.8.3/src/decoding.cc)，沒有執行該後端。

- no-speech probability 取 SOT 所在步驟的原始 logits softmax，不能從已 suppression 的向量或是否輸出 EOS 推測。
- beam 的完成候選數、patience、length penalty 和 EOS 處理仍需在正式 decoder 中移植；目前的資源探測不驗證這些語意。
- `max_length=448` 不是生成 448 個新 tokens 的指令。此版本還會按 prompt/start step 與一半長度限制計算生成上限，不能照搬成 `max_new_tokens:448`。
- align 另有 valid-frame softmax、文字軸正規化、median filter、head 平均、DTW 與 text-vocabulary 詞機率等規則。取得 attention 並不等於已驗證 align 等價。

## 結論與尚未通過的部分

**此模型在兩個後端均未發現所測底層能力缺口。** 低階 forward 與 cache 足以支援後續控制層實作研究，不能因此宣稱現成 pipeline 已等價，或上游完整流程已可交付。

尚未驗證：長上下文／完整生成負載、正式 beam/EOS/patience/score、temperature fallback、完整 ASR 詞時間及切段、全曲效能、不同素材與硬體。後續若發現必要能力缺失，仍須停止相依工作並回報，不得改模型／精度／後端或用 greedy／固定 overlap 替代。

可靠度分數：95%（上述已測原始能力）；完整 ASR 等價性目前未驗收。新增長負載及來源語意測試可提高覆蓋，不能靠這份短程結果推定。

## 本機證據與重現

- `.local/results/asr-capability-webgpu.json`、`asr-capability-wasm.json`：兩個後端原始探測結果。
- `.local/results/asr-capability-summary.json`：獨立 assertions 核對後的彙總、數值及原始報告 SHA-256。
- `.local/results/asr-capability-memory.jsonl`：含其他視窗的程序級採樣。
- `.local/asr-capability/`：Worker、驗證頁、Vite 設定、來源定義及 `verify.mjs`。資料均留在 Git 忽略目錄。

在專案根目錄以 Node 執行 `node spike/node_modules/vite/bin/vite.js --config .local/asr-capability/vite.config.mjs`，於 `http://127.0.0.1:5176/` 選音檔，再分別執行兩個後端。每個測試完成會清理模型並終止 Worker，報告由本機 server 儲存。兩者完成後執行 `node .local/asr-capability/verify.mjs` 核對；server 只按需啟動，交付時停止。
