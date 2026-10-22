# small.en／q4 ASR 驗證

已完成本次固定範圍：瀏覽器 WASM（單執行緒）／WebGPU、small.en／q4、auto／window 4、no-vad。正式 Worker 使用自訂 beam／sampling、控制與 ASR 詞時間，沒有 pipeline／greedy 替代、歌詞提示、已知歌詞重對齊或額外時間修整。

## 全曲實測

桌面 Chrome 155、NVIDIA Pascal adapter；同素材兩後端的檔案 SHA 與解碼後 PCM SHA 相同。以下為單次觀察，部分後端驗證並行執行，耗時不應視為隔離效能基準。

| 素材 | 後端 | ASR 段／詞 | WER | auto | 行匹配 | 起點 ±1秒 | 推論秒 | seek／重試 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 官方 130.30 秒 | WebGPU | 6／76 | 12.0% | 2 | 12/12 | 無人工參考 | 139.49 | 6／0 |
| 官方 130.30 秒 | WASM | 6／76 | 12.0% | 2 | 12/12 | 無人工參考 | 342.05 | 6／0 |
| 原始 206.68 秒 | WebGPU | 17／121 | 95.2% | 1 | 0/18 | 0/17 | 959.65 | 10／10 |
| 原始 206.68 秒 | WASM | 10／107 | 44.2% | 2 | 18/18 | 12/17 | 856.22 | 10／5 |

推論含全曲特徵、解碼、重試及 ASR 詞時間，不含模型載入與音訊解碼。行匹配不代表時間正確；原始素材有 17 個已知起點、1 行未提供參考。WASM 起點平均絕對誤差 0.799 秒、P90 2.407 秒、最差 2.833 秒；WebGPU 全未匹配，誤差統計為 null。WER 沿用既有英文正規化，數字不展開為英文詞。

原始素材觸發 sampling；未固定與 CT2 相同的亂數序列。因此兩後端這次的差異混合數值與抽樣路徑，不能據此判斷後端普遍優劣，也不能把 18/18 當成時間準確率。沒有為取得任何匹配率修改規則。

官方 WebGPU 另重跑一次：首跑 160.62 秒、重跑 139.49 秒，整個 ASR output（tokens、候選分數、words、時間、控制 trace）嚴格相等；兩次皆未觸發 sampling。歌詞隔離測試亦確認改歌詞只改配對，不改 ASR 文字、詞、token 或時間。

## 一致性與能力證據

- 四份正式 Worker 報告共 **32 輪 seek**，以抽出的上游 Python 純函式、保存的 q4 解碼回應重播：prompt／fallback／no-speech／timestamp 切段／詞邊界／seek／前文均 **0 差異**。推論呼叫用保存回應替代，沒有匯入或執行 faster-whisper／CTranslate2 backend。
- 四份相同 segments 與歌詞交給未修改的 lyric-align auto／window4 配對器：行文字、分數、匹配與時間均 **0 差異**。
- **47 項測試**、lint、typecheck、production build 通過。fixtures 包含 38 組相似度、12 組 pairing1、120 組 auto、48 組呼吸、150 組切段／seek、80 組詞邊界、204 組 canonical zlib 案例。
- 原始 logits（51,864 維）、SOT no-speech 機率、encoder 重用、獨立 cache、交錯候選／釋放隔離，以及 12 層 cross attention／19 個指定 heads，在兩後端通過。
- 兩後端 **448-token context、五份獨立 cache** 負載通過。第一與第五分支對完整 prefix forward 的 argmax 相同，符合 `abs(error) <= .002 + .002*abs(reference)`；最大差異 WebGPU 0.00002432、WASM 0.00001812。encoder 各 1 次，清理後追蹤張量 0。
- 全曲特徵在短音訊、1 秒、恰好 30 秒及尾端案例，與獨立 NumPy 計算的選定點最大差異約 4.77×10⁻⁷；正規化只做一次，短尾段按上游有效 frames 補零。
- 壓縮統計固定 pako 3.0.2、`legacyHash:true` 及 canonical zlib 預設參數。204 組 Python zlib 1.3.1 案例在 Node／瀏覽器均相同。[pako 選項定義](https://nodeca.github.io/pako/interfaces/DeflateOptions.html#legacyhash)
- 正式頁面 WASM 模型載入、中止與釋放均測過；四份完整 Worker 報告均確認 released，結束追蹤張量 0。錯誤／中止保留部分 trace，不冒充完成結果。

## 資源範圍

完整 context 負載的追蹤張量峰值各為 1,346,356,736 bytes（約 1,284 MiB）。四次全曲峰值約 1,137–1,178 MiB。這是 wrapper 追蹤的張量儲存量，可能含別名；不含權重、runtime workspace、瀏覽器與驅動，不能視為獨佔 RAM／VRAM。候選 cache 使用獨立 CPU 複本，WebGPU 包含下載／上傳成本。

`.local/results/asr-port-memory.jsonl` 另有程序級採樣，包含所有 ChatGPT／Chrome／Codex／Edge 視窗，不是此模型專用記憶體。不能用這些觀察承諾其他硬體、手機或歌曲的效能。

## 素材與上游保存結果

官方音檔 SHA-256：`834b463be93a8b19d05a72e94c429ab3618691aeb593869f603f58d22a8c7676`；PCM：`d00f56a44eff44e21b8e98a839f67f3e4e7db9dd92f31f84b07bfd8f83097529`。

原始音檔 SHA-256：`138a911609554655a676e27499e532c23b2152e12f45d81f91acb0fef0ea04c1`；PCM：`f1221618dcbacd9b13cae7b11de177645c54d16e8498db1384d58a9184cd706d`。

既有 medium／CPU／int8 保存結果僅供參考：官方為 12 段／75 詞、WER 0%；原始錄音為 24 個標點段落、英文 WER 100%。本次沒有重跑該 backend，也沒有測未量化模型。模型大小、量化、runtime、音訊解碼與抽樣不同，不能以此單獨歸因哪一項造成品質差異。

## 規則來源與仍存在的限制

- [lyric-align ebe62d8 anchor.py](https://github.com/ijuinryukichi/lyric-align/blob/ebe62d8a8628d0b2579987598f0442ebffcc68bb/src/lyric_align/anchor.py)、`breath.py`：auto、群組、window、門檻、呼吸。
- [faster-whisper 1.2.1 transcribe.py](https://github.com/SYSTRAN/faster-whisper/blob/v1.2.1/faster_whisper/transcribe.py)：fallback、prompt、seek、詞／段落邊界；同版 tokenizer／feature_extractor。
- [CTranslate2 4.8.3 whisper.cc](https://github.com/OpenNMT/CTranslate2/blob/v4.8.3/src/models/whisper.cc)、[decoding.cc](https://github.com/OpenNMT/CTranslate2/blob/v4.8.3/src/decoding.cc)、`sampling.cc`、`dtw.cc`、`median_filter_cpu.cc`：mask、no-speech、長度、分數、候選及 align。

ONNX 輸出 post-softmax attention；裁切後按有效 frames 機率和重新正規化，數學上對應裁切 QK 後 softmax，沒有把機率再 softmax。遇零值、非有限值或零變異會報錯；沒有同模型 CT2 raw-QK 的逐浮點對照，不能宣稱數值等同。

TopK 同分採 parent/token 穩定排序，CT2 裝置順序不保證相同；sampling 使用 Math.random，與 CT2 亂數不同。Web Audio／PyAV 解碼也不承諾相同 PCM。底層 adapter 固定 Transformers.js 4.3.1，升級必須重新驗證。以上屬明確限制，未用其他流程掩蓋。

## 本機證據

- `asr-port-{official,original}-full-{webgpu,wasm}.json`：正式 Worker 原始輸出、實際模型／設定、所有 seek／候選／重試／前文／段落形成。
- `asr-port-*-report.json`、`asr-port-summary.json`：schema5 與重算品質；`asr-port-original-*-scoring.json`：人工起點評分。
- `asr-port-validation.json`：原始報告 SHA、同 PCM、進度、token 上限、資源清理核對。
- `asr-port-control-parity.json`：上游純控制重播；`asr-port-pairing-parity.json`：同 segments 配對比較。
- `asr-port-repeat-parity.json`：官方 beam 重跑的完整 output 相等證據；baseline／repeat 各自保存。
- `asr-port-official-long-*.json`、`asr-port-official-features-webgpu.json`、`asr-port-official-compression-webgpu.json`：底層負載／特徵／壓縮參考。
- `asr-port-device.json`、`asr-port-ui.png`、`asr-port-memory.jsonl`：裝置、正式頁面與程序採樣。

以上位於 `.local/results/`；重現工具位於 `.local/asr-capability/`，純 fixture 重建腳本位於 `spike/scripts/`。音檔、歌詞、模型及完整辨識只留本機。schema5 評分拒絕原始模型／設定不符或缺失的報告，不能替舊結果蓋上新設定。

本次 5174／5176 伺服器及採樣程序已停止，確認不再 listening；驗證頁籤已關閉。命令、cwd、port、session／PID 與停止核對保留於 `asr-port-lifecycle.json`。

可靠度分數：95%（已測流程與資料；不是逐浮點或跨硬體保證）。可在相同 q4／瀏覽器限制下，以更多素材、硬體及獨立矩陣參考擴充驗證；抽樣路徑和模型輸出不同時，應檢查 trace，不以品質目標調整規則。
