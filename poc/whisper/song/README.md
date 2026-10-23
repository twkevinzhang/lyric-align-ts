# 歌曲對齊 CPU／WASM PoC

預設 small Q5_1 的固定來源見上層 `lock.json`；tiny/base 與 tiny F16 實驗的雜湊見 `inference-config.mjs`。採用 compact byte Q5/Q8 暫存、F16 4×4 分塊及 SIMD。owner Worker 管理單一模型；8 個計算執行緒包含 owner 與 7 個 helper，helper 池上限 12。主執行緒處理 UI，Node.js 執行 tokenizer 與 DTW；解碼控制可明示選擇 Node 或 Worker。

`fast.mjs` 固定設定已完成三曲各三次驗收，九次全部通過。Amazing Grace 3.735–4.234 秒、SUNEO-ISM 9.357–9.602 秒、春泥棒 7.453–8.486 秒；排除額度後句首 MAE 分別 0.460、0.193、0.429 秒。最新完整量測及排除句見 [實測報告](../../../docs/ten-second-alignment-report.md)。範圍限指定三曲與目前本機環境。

## 10 秒設定入口

本機已備妥模型與 timescale12 建置，從專案根目錄執行：

```powershell
node poc/whisper/song/fast.mjs
```

Chrome 開啟 `http://127.0.0.1:5174/`。使用下方 `SONG_DIR`、`SONG_AUDIO`、`SONG_LYRICS`、`SONG_LANGUAGE` 選輸入；fast 入口固定全部推論參數，設定來源為 `fast-preset.mjs`。它使用 tiny Q5_1、Worker 解碼及 DTW；Node 負責 tokenizer 與協調。直接執行 serve.mjs 仍保留原本 small 預設。

三輪正式重測及獨立核對（每次使用新的實驗名稱）：

```powershell
node poc/whisper/song/fast.mjs benchmark validation-1
node poc/whisper/song/fast.mjs benchmark validation-2
node poc/whisper/song/fast.mjs benchmark validation-3
node poc/whisper/song/validate-candidate.mjs validation-1 validation-2 validation-3
node poc/whisper/song/benchmark-report.mjs
```

benchmark 保留失敗實驗供診斷；是否通過以 validate-candidate 的結果及退出碼為準。不可與建置或其他效能測試同時執行。

## 建置

先執行上層 `setup.ps1` 準備來源、模型與工具鏈，再從專案根目錄執行：

```powershell
node poc/whisper/song/compact-source.mjs
$image = (Get-Content poc/whisper/lock.json -Raw | ConvertFrom-Json).buildImage
& 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' run --rm -v "${PWD}:/work" -w /work $image bash poc/whisper/song/build-compact12.sh
node .local/whisper-poc/build-song-compact12/unroll_test.cjs
node --test poc/whisper/song/*.test.mjs
```

`packed-source.mjs` 與 `tiled-kernel.h` 是 compact 的 F16 建置相依；`compact-source.mjs` 在其上加入 compact Q5/Q8 核心。編譯停用自動浮點 FMA，建置腳本檢查 WASM 指令。

## 執行

需 Echogarden 3.4.0，透過 `ECHOGARDEN_DIR` 指定安裝目錄；本機預設路徑見 `common.mjs`。

```powershell
$env:SONG_THREADS='8'
$env:SONG_POOL_SIZE='12'
$env:SONG_WASM_BUILD='compact12'
$env:SONG_DIR='C:/Users/DragonXwin10/Downloads/audio/TestSet/amazing_grace'
$env:SONG_AUDIO='256k-16kHz-單聲道.wav'
$env:SONG_LYRICS='Original.txt'
$env:SONG_LANGUAGE='en'
$env:SONG_OUTPUT='song'
node poc/whisper/song/native-run.mjs
node poc/whisper/song/serve.mjs
```

Chrome 開啟 `http://127.0.0.1:5174/` 點開始；完成後 Ctrl+C 停止伺服器。推論順序執行，維持使用者既有多工環境。日文設 `SONG_LANGUAGE=ja`；歌詞來源可為 SRT，此時只抽取文字，不使用參考時間。`SONG_MODE=calibrate` 可測前 30 秒 encoder，正式整曲測量不設此值。

三曲測試設定見 `three-song-config.mjs`。新的 `node poc/whisper/song/benchmark.mjs <實驗名稱> [grace,suneo,haru]` 以獨立 headless Chrome 依序量測，完成或失敗後關閉瀏覽器與本輪伺服器。結果存於 `.local/whisper-poc/speed-<實驗名稱>-<歌曲>/`。執行 `node poc/whisper/song/benchmark-report.mjs` 重算報告及逐句 CSV。

實驗參數：`SONG_MODEL=tiny|base|small`、`SONG_MODEL_PRECISION=q5_1|f16`（F16 僅 tiny）、`SONG_DECODE_LOCATION=node|worker`、`SONG_CACHE_POSITION=upstream|contiguous`。`timescale12` 額外支援 `SONG_TIME_SCALE=1|2|3|4`、Worker 的 `SONG_WORKER_TOKEN_BUDGET=1..444`、`SONG_SPECULATIVE_BATCH=1..256` 及 `SONG_VOCAB_SUBSET=1`。這些是待驗證實驗，不能把不同設定的結果混為同一候選。

`timescale12` 在 compact 來源準備完成後，先執行 `node poc/whisper/song/timescale-source.mjs`，再以同一 Docker image 執行 `build-timescale12.sh`。模型須預先放於 `.local/whisper-poc/` 並通過固定 SHA256 檢查。

fast 所需模型為 `ggml-tiny-q5_1.bin`，固定來源 `https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-tiny-q5_1.bin`，SHA256 為 `818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7`（以 `inference-config.mjs` 的完整雜湊為準，啟動時自動檢查）。

`SONG_WORKER_ALIGNMENT=1` 將同一注意力處理及 DTW 移至 Worker，減少張量傳輸。`SONG_JAPANESE_SPACING=natural` 移除上游分詞插入的日文間空白，輸出完整 UTF-8 token 時間單位；已於 fast 固定組合完成三曲驗收。`SONG_AUDIO_CONTEXT=750|375|1500` 同步設定模型 context 與完整音訊分段長度（15／7.5／30 秒虛擬時間），仍須重新驗收。

固定 Q5 權重快取未提供加速，建置預設停用。需要重現時，在執行 `timescale-source.mjs` 前明示設 `SONG_BUILD_WEIGHT_CACHE=1`；編譯腳本會依來源 metadata 啟用對應的快取生命週期測試。

## 比較邊界

- 歌詞引導對齊不是自由辨識；CER 不適用。配對成功不等於時間正確。每曲最多排除 floor(N×10%) 句，無效句先占額度，保留句首平均絕對誤差須 ≤1 秒，總耗時須 ≤10 秒；句尾不影響通過與否。
- 模型、歌詞與相同 PCM 組以 SHA256 核對。推論時間包含初始化、完整對齊與 WASM RPC，不含音檔準備、模型傳入瀏覽器或評分。
- 官方 DLL commit 未驗證與 fork 相同，且官方 N-API 與 WASM 的 logits 列讀取不同，不能將全部差異歸因於平台。
- 官方可能在結果寫出後於清理階段異常退出；`native-run.mjs` 將退出狀態與結果雜湊綁定，不掩蓋失敗。
- 最終組合改變分詞與推論參數，驗證的是指定歌曲的時間／品質門檻，不宣稱與原生模型張量或逐 token 輸出完全一致。
