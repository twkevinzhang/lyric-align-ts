# 歌曲對齊 CPU／WASM PoC

固定來源與多語 small Q5_1 模型見上層 `lock.json`。採用 compact byte Q5/Q8 暫存、F16 4×4 分塊及 SIMD；不改模型權重或量化精度。owner Worker 管理單一模型，8 個計算執行緒包含 owner 與 7 個 helper，helper 池上限 12。主執行緒處理 UI，Node.js 執行官方 tokenizer、解碼控制與 DTW。

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

三曲測試設定見 `three-song-config.mjs`。`three-song-native.mjs` 依序測官方相同 WAV 與原始容器；各曲 WASM 使用對應 `eval-three-<id>-pcm` 輸出目錄，再以 `three-song-report.mjs` 產生評估表、逐句 CSV／SRT 至 `.local/whisper-poc/eval-three-report/`。

## 比較邊界

- 歌詞引導對齊不是自由辨識；CER 不適用。配對成功不等於時間正確，評分只看句首，最大誤差不排除離群值。
- 模型、歌詞與相同 PCM 組以 SHA256 核對。推論時間包含初始化、完整對齊與 WASM RPC，不含音檔準備、模型傳入瀏覽器或評分。
- 官方 DLL commit 未驗證與 fork 相同，且官方 N-API 與 WASM 的 logits 列讀取不同，不能將全部差異歸因於平台。
- 官方可能在結果寫出後於清理階段異常退出；`native-run.mjs` 將退出狀態與結果雜湊綁定，不掩蓋失敗。
- 日文歌曲對齊及完整張量數值一致性仍有問題；單曲表現不代表跨曲可用。
