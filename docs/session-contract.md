# Browser session contract v1

本分支以 `741458c` 的 tiny／WASM 為基底，實現 `src/contract.ts` 的消費端結構契約。`createBinding` 及預設 `binding` 從根入口與 `lyric-align-ts/binding` 匯出。套件及 capabilities 版本均為 `0.1.1`，供目前 yt-subtitle loader 的版本檢查使用；這是本機候選產物，沒有發布，也不等同其他分支的 scoped npm small.en/WebGPU 套件。

## 邊界與設定

- yt-subtitle 提供完整 mono 16 kHz finite Float32Array PCM、原始歌詞與 AbortSignal；自行驗證並一次發布完整字幕。library 不操作播放器、不取得歌曲、不發布部分字幕。
- `createBinding({workerUrl?,assetBaseUrl?,modelUrl?,threads?})` 只設定靜態資產位置及執行緒。模型固定 `ggerganov/whisper.cpp/ggml-tiny-q5_1.bin`，revision `5359861c739e955e79d9a303bcbc70fb988958b1`、dtype `q5_1`，並強制驗證 SHA256。預設 8 threads；支援 1/2/4/6/8/12。
- 語言宣告 `en/ja/zh`。language 未指定時沿用最近 prepare 的語言，沒有指定過則用 `en`。不自動辨識語言、不下載其他模型；模型支援不等於歌曲辨識品質保證。
- alignmentOptions 僅 `threshold`、`karaoke`。threshold 預設 0.65，範圍 0–1；karaoke 僅 false。`pairing`、`window`、`lyricsContext` 等未實現選項明確拒絕為 `UNSUPPORTED_OPTION`；capabilities.lyricsContext 為 false。
- 需要安全來源、crossOriginIsolated、Worker、WebAssembly、SharedArrayBuffer、Intl.Segmenter。WASM 初始記憶體 512 MiB，最大 2 GiB，另需模型與 JS 記憶體；本版未完成 MV3 offscreen／跨 tab 產品端到端驗收。

## 執行與資料

createBinding/createSession 都不讀取裝置或下載資料。prepare 建立 classic Worker、載入既定模型及 tokenizer。重複 prepare 可重用已準備模型。

同 session 只允許一個操作；先 prepare，再 transcribe，再 align。並行、未準備或已釋放的 session 回報 INVALID_INPUT。transcribe 複製 PCM 後 transfer，保留 caller buffer；以原始音訊速度逐 30 秒視窗自由解碼，清除詞彙子集限制，使用獨立 Whisper instance，沒有歌詞強制 token。數位全零音訊直接回傳空 evidence；非零靜音、噪音及音樂仍可能讓模型產生幻覺。

align 只消費傳入的 segments／words，不再執行聲學推論。配對使用 NFKC、大小寫與標點正規化後的單調全曲字元對齊；輸出每行仍為逐字原文，行數與順序完整保留。score 為對齊相等字元數除以歌詞／對應 ASR 跨度的較長長度，僅為文字相似度。

時間只取 ASR word 邊界；無 words 時取 segment 邊界。無證據、分數不足或多行共用無法細分的同一 word／segment 時，相關行 matched=false、start/end=null。不插補、不猜單位內的句界、不延長鄰句。不同獨立證據原有的重疊可以保留。空白及非語音字元行若直接傳入仍保留 unmatched row，消費端應只送非空白行。

文字對齊使用 trace matrix，最多 64,000,000 cells；超過時明確 INVALID_INPUT，不靜默截斷歌詞。記憶體不足可回報 OUT_OF_MEMORY。所有時間為秒，ASR word 不合法／零長／超界時不作配對證據；不把 ASR 文字改作使用者歌詞。

## 生命週期、進度與錯誤

每個操作的進度 phase 分別是 preparing-model、transcribing、aligning，sequence 在該次操作單調遞增。現有 backend 不提供有明確單位與 scope 的測量，因此本版只送 indeterminate；沒有推估百分比。callback 拋錯不影響計算。

abort 會終止 session Worker，拒絕目前操作為 ABORTED，該 session 不可重用。dispose 是可重複的 async 方法；也能安全終止 active operation。同步 WASM／pthread 的實際回收可能延後至 kernel 返回；實測 Chrome 於 15 秒寬限內無剩餘 Workers。消費端應等待操作退出再 dispose，超時則終止其 host。

所有 rejected operations 回報 Error 上的 `{code,message}`，不依賴跨 realm instanceof。契約錯誤碼保留；prepare、transcribe、align 的非契約錯誤分別映射 MODEL_LOAD_FAILED、TRANSCRIPTION_FAILED、ALIGNMENT_FAILED，已知 allocation failure 映射 OUT_OF_MEMORY。無 binding 的 LIBRARY_UNAVAILABLE 屬消費端責任。

## 已驗證範圍與限制

固定 Docker／Emscripten 原生資產已重建；source digest/idempotence、mel 與 F16/Q5 矩陣驗證通過。Windows shell 檔固定 LF，避免 Docker bash 誤讀 CRLF。沿用既有 build directory 時，舊實驗的 `POC_WEIGHT_CACHE=ON` cache 必須關閉或使用乾淨 build directory；本次已排除該 cache。

真實桌面 Chrome／WASM 已驗證 JFK 語音獨立 ASR、三行完整配對、1/30 秒數位靜音、session 重用、取消及 dispose 後零 live Workers。tarball 在獨立 consumer 安裝，根入口及 `/binding` 的型別與實際 WASM 推論通過。

唯讀讀取目前 yt-subtitle 的原始 loader、runner、prepareLyrics 與 validator，打包進測試 harness：loader 接受此分支版本，JFK 三行原文（含前後空白、原文空行索引）通過完整驗證，純靜音被判為 incomplete。未修改 yt-subtitle；沒有驗證獨立整首音訊提供者、extension offscreen、跨 tab 或字幕 overlay。

全曲實測以完整 PCM 與原始歌詞執行，預設 threshold=0.65，結果如下。耗時只含準備完成後的 ASR＋文字配對，不含模型載入，不代表時間準確度。

| 歌曲 | 全曲秒數 | 處理秒數（約） | matched / 必要行 | 整首驗收 |
|---|---:|---:|---:|---|
| Amazing Grace | 130.30 | 4.94 | 4 / 12 | 不套用 |
| SUNEO-ISM | 299.95 | 12.86 | 6 / 133 | 不套用 |
| 春泥棒 | 299.24 | 10.15 | 3 / 56 | 不套用 |

tiny 的自由 ASR 對歌唱有錯字、漏字及重複幻覺。這三首都未達全行匹配，不能宣稱無時間碼歌曲流程可用，也未宣稱演唱時間精準。消費端必須保留先前成功字幕，不套用這些不完整新結果。需要另行改善 ASR／歌詞提示及配對品質，並以全行成功和人工時間對照驗證後，才能提高此項結論。

可靠度分數：98%（契約及真實語音接線）；無時間碼全曲可用性：目前驗收不通過。驗證方式：下列命令可重現機制測試；全曲 fixture 的 matched 必須全部成功，另須以人工／來源參考檢查時間，才可改變全曲判定。

## 驗證命令

```sh
pnpm run build:native
pnpm run build
pnpm run typecheck
pnpm test
pnpm run test:browser
pnpm run test:contract
pnpm run test:package
node scripts/test-contract-browser.mjs /path/to/fixtures.json
node scripts/test-consumer-contract.mjs /path/to/yt-subtitle
```

fixtures.json 接受 `{ "songs": [{ "id": "song", "audio": "/absolute/song.wav", "lyrics": "/absolute/lyrics.txt", "language": "en" }] }`；lyrics 亦可為 SRT，原時間不作推論輸入。harness 的全曲斷言只證明契約／範圍安全，逐首 matched 數需另判定可用性。測試 server 由 finally 關閉；詳細 JSON 放於忽略的 `.local/contract/`。consumer harness 僅讀取外部 checkout，使用本機固定模型回應其模型下載。
