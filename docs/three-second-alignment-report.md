# 三秒歌曲對齊：現況報告

更新日期：2026-10-24（Asia/Taipei）。狀態：原指定三首正式九次全過；追加三首測試僅 Green 通過，Boys Will Be Bugs 與 Lift Every Voice and Sing 未通過。

## 計時與判定

本次以模型已載入後的 operationSeconds 判定，包含 WAV Blob 解碼、推論、Worker 往返、句子配對與 SRT 產出。初始化另列，不含於三秒門檻；輸入取得與事後評分在計時外。每次新建已初始化的 aligner，沒有事先跑歌曲暖機，也沒有重用對齊結果。

採每首排除最多 floor(N×10%) 句後，剩餘有效句首平均絕對誤差 ≤1 秒；無效句先佔排除額度。句尾只列報告，使用同一排除名單。逐句比對使用參考 SRT，推論只取得歌詞文字。速度門檻每次 ≤3 秒，不排除較慢執行。

舊 benchmark 原始 JSON 的 acceptance 仍是「totalSeconds ≤10 秒」規則，不代表本次三秒通過。下表與 three-second-assessment.json 已依 operationSeconds ≤3 重新判定並獨立核對品質平均。

## 追加三首測試（相同正式版本）

2026-10-24 按使用者指定 TestSet-Candidates-2026-10-24 資料夾測試。沒有調參或改推論程式，dist 的 index.js／worker.js／parity.js／parity.wasm SHA256 與前次通過的 build28 一致。仍為模型載入後完整 operationSeconds，每首新實例獨立三次；輸入為 256k-16kHz-單聲道.wav、lyrics.txt，參考為 source.en.srt，三首 language=en、8 執行緒。

| 歌曲 | 三次 operation 秒 | 最慢秒 | 排除／總句數 | 保留句首 MAE 秒 | 同批句尾 MAE 秒（不設門檻） | 完整驗收 |
|---|---|---:|---:|---:|---:|---|
| Green | 2.250／2.283／2.263 | 2.283 | 3/38 | 0.685 | 0.910 | 通過 |
| Boys Will Be Bugs | 3.327／2.657／2.513 | 3.327 | 8/88 | 2.843 | 3.172 | 未通過 |
| Lift Every Voice and Sing | 1.488／1.744／1.610 | 1.744 | 1/19 | 1.083 | 1.855 | 未通過 |

觀察事實：Green 三次速度與品質皆通過；Boys Will Be Bugs 一次超時（3.326640 秒）、三次句首品質皆失敗；Lift Every Voice and Sing 三次速度通過，但三次句首 MAE 1.082944 秒超過 1 秒。每首三次品質數值一致。結論：追加三首僅 Green 完整通過，不能將前次三首達標推廣成這六首全部達標。可靠度分數：99%（直接測量、逐句誤差與重新計算驗收一致）。驗證方式：重跑下列設定，逐次核對原始結果。

原始九次結果、逐句輸出、排除名單、負載、環境及輸入／程式雜湊：`.local/three-second/1792837560091-production-candidates-three-song/`。重現指令：`node scripts/benchmark-three-second.mjs .local/package/three-second-candidates.json`。資料夾原說明指出字幕來自外部來源、尚未逐句人工聽校；本次品質數字表示相對該 SRT 的誤差，不將字幕另行宣稱為已人工驗證。

後續改善方向：先檢查 Boys Will Be Bugs 的長段落漂移與 Lift 的句首系統偏差，再評估兼顧六首的設定；本次依要求完成測試，未修改既有通過版本。

## 原始基準九次結果（比較用）

| 歌曲／次數 | 完整處理秒 | 引擎對齊秒 | 初始化秒（排除） | 排除／參考句數 | 保留句首 MAE 秒 | 同批句尾 MAE 秒 | 三秒驗收 |
|---|---:|---:|---:|---:|---:|---:|---|
| Amazing Grace r1 | 3.928 | 3.782 | 0.403 | 1/12 | 0.464 | 0.787 | 未通過 |
| SUNEO-ISM r1 | 10.282 | 9.974 | 0.511 | 12/125 | 0.225 | 0.343 | 未通過 |
| 春泥棒 r1 | 7.474 | 7.080 | 0.658 | 5/56 | 0.432 | 0.721 | 未通過 |
| Amazing Grace r2 | 5.733 | 5.570 | 0.451 | 1/12 | 0.464 | 0.787 | 未通過 |
| SUNEO-ISM r2 | 11.351 | 10.991 | 0.406 | 12/125 | 0.225 | 0.343 | 未通過 |
| 春泥棒 r2 | 6.921 | 6.652 | 0.413 | 5/56 | 0.432 | 0.721 | 未通過 |
| Amazing Grace r3 | 4.218 | 4.064 | 0.479 | 1/12 | 0.464 | 0.787 | 未通過 |
| SUNEO-ISM r3 | 28.019 | 27.474 | 0.773 | 12/125 | 0.225 | 0.343 | 未通過 |
| 春泥棒 r3 | 19.315 | 19.029 | 0.636 | 5/56 | 0.432 | 0.721 | 未通過 |

三首各次的句首品質皆通過，但九次耗時全數超過 3 秒。SUNEO-ISM 輸入產生 133 個 cues，而參考 SRT 為 125 句，因此評分按參考文字配對後的 125 句計算；輸出有 6 個帶 issues 的 cues，完整細節在原始 JSON，不能將品質平均通過說成每句輸出皆完美。

## 原始基準排除名單

- Amazing Grace：第 1 句（6.600 秒）。
- SUNEO-ISM：第 121 句（13.686 秒）、第 59 句（8.033 秒）、第 60 句（6.200 秒）、第 43 句（4.000 秒）、第 1 句（3.467 秒）、第 101 句（2.894 秒）、第 61 句（2.600 秒）、第 42 句（1.767 秒）、第 102 句（1.640 秒）、第 63 句（1.400 秒）、第 9 句（1.360 秒）、第 34 句（1.107 秒）。
- 春泥棒：第 1 句（17.430 秒）、第 37 句（16.651 秒）、第 16 句（15.548 秒）、第 53 句（6.451 秒）、第 55 句（2.039 秒）。

同曲三次排除名單與品質數值一致。

## 最終正式驗收與結論

| 歌曲 | 三次 operation 秒 | 最慢秒 | 排除／總句數 | 保留句首 MAE 秒 | 同批句尾 MAE 秒（不設門檻） |
|---|---|---:|---:|---:|---:|
| Amazing Grace | 1.250／1.475／1.477 | 1.477 | 1/12 | 0.591 | 0.971 |
| SUNEO-ISM | 2.771／2.711／2.719 | 2.771 | 12/125 | 0.970 | 1.218 |
| 春泥棒 | 2.369／2.200／2.230 | 2.369 | 5/56 | 0.277 | 1.517 |

原始九次完整結果、輸入／模型／原始碼／實際 dist 雜湊：`.local/three-second/1792812241771-production-final-acceptance-full-tile44/`。設定檔：`.local/package/three-second-final4.json`。指令：`node scripts/benchmark-three-second.mjs .local/package/three-second-final4.json`。每次建立新實例，未做歌曲暖機；使用正式 dist、8 執行緒、關閉 profiling。

最終排除句（參考 SRT 的句號，未另挑句尾排除名單）：

- Amazing Grace：1。
- SUNEO-ISM：23、22、24、47、80、46、21、86、100、43、79、25。
- 春泥棒：37、1、53、55、18。

觀察事實：同一最終版本三首各三次，九次 operationSeconds 均 ≤3、品質均通過。保留先前正式輪次的全部失敗：第一輪 8/9 通過，春泥棒 3.057 秒；第二輪 7/9，SUNEO-ISM 3.396／3.012 秒；第三輪 7/9，SUNEO-ISM 3.003／3.455 秒。最終版本在這些失敗後加入 attention／模型 4×4 整數矩陣 tile，沒有刪除慢速紀錄或更改計時範圍。

推論：較少的重複矩陣載入有助本機速度餘裕，但各輪有負載差異，不能把差額全歸因於單一改動。結論：指定範圍的九次驗收已達標；不推定任意負載、硬體、瀏覽器或其他歌曲同樣達標。可靠度分數：99%（直接測量與原始輸出可重算）。驗證方式：按上述設定重跑並檢查每次速度、品質及原始輸出。

目前預設：960 格 context、3.25 倍 mel 時間壓縮、440-token 引導批次、整列 Q7/Q8 常數權重預整理、64／128 元素量化區塊、模型與 attention 4×4 整數 tile、SIMD 函數、完整 PCM 的最後視窗縮短、4 格 attention 聚合、位置懲罰 10、略過未用 logits 與 mel 全零區塊。位置懲罰只用 token 順序與音訊格數，不接受參考時間；模型預整理不讀取歌曲。

保留的低階優化由獨立測試驗證：FFT 對 double DFT 最大絕對差約 0.0000314；稀疏 mel 與密集原計算逐位元相同；三首 PCM 快速解碼與 Chrome 原解碼逐樣本相同。原生矩陣測試涵蓋 scalar Q7/Q8 對照、奇數維度、尾段、廣播、多執行緒與快取重設。原生整數運算早期曾因 signed i7 語意失敗，已依 [WebAssembly relaxed SIMD 規格](https://github.com/WebAssembly/relaxed-simd/blob/main/proposals/relaxed-simd/Overview.md) 使用 0–126 編碼並補償偏移。

已淘汰的候選包括縮減 encoder 層、特徵降採樣、稀疏 K/V、替代 mel 取樣、F32 權重展開、高壓縮／短視窗、多組 attention head／濾波／正規化／前瞻參數與 12 執行緒。各組設定、品質失敗、速度波動皆列於後方紀錄。

驗證紀錄：58 項 JS 測試（含來源重現與重複準備）全過，兩份 TypeScript 設定通過；native build28 全數檢查通過。真實 Chrome／WASM 已驗證 500 詞密集最後視窗全部具有實際 attention 輸出、重用、fetch／hash 錯誤、dispose、取消及 Worker 終止。不同歌曲 Suneo→Grace→春泥棒→Grace 重用的 words／SRT／原始長度與新實例逐值相同。獨立審查指出的密集尾段 440-token 截斷已修正為受限分塊後合成同一條路徑，審查複核無剩餘重要問題。密集靜音測試只驗證覆蓋與狀態，不宣稱其聲學時間準確。

套件與清理檢查：tarball 內容 allowlist、獨立 consumer 安裝、型別與實際 Chrome WASM 推論皆通過（`.local/three-second-package-final.log`、`.local/package/package-check.json`）。瀏覽器與測試伺服器均在 finally 關閉；最終驗收程序及九個測試 port 已確認不存在。未啟動常駐 dev server，未發布或提交。下一次改進方向：本次指定目標已達成，先以更廣曲目與不同負載驗證泛化及穩定性，再考慮進一步速度取捨；不以此後續方向延長或擴大本次驗收。

## 環境、來源與重現

以下環境與指令描述原始基準；後續候選的參數、來源、編譯產物及負載見各組 manifest。

- CPU：AMD Ryzen 5 3600 6-Core Processor              ，12 邏輯處理器；Chrome 155.0.8059.85；Node v24.19.0；8 計算執行緒、tiny Q5_1、2 倍 mel 壓縮、128-token 批次。
- 重新執行 node scripts/build.mjs 產生目前 JS／Worker／型別；本輪未重編 native WASM，使用已有產物，雜湊已保存。工作區原本存在大量未提交變更，不能只用 HEAD 代表測試版本；原始碼與實際 dist 檔案另存 SHA256。
- 指令：node scripts/benchmark-browser.mjs .local/package/three-second-baseline-fixtures.json。
- 原始資料：.local/package/benchmark-1792800752639/summary.json 與各曲各次 JSON。
- 本次三秒判定、輸入／參考／模型／來源與產物雜湊：.local/package/benchmark-1792800752639/three-second-assessment.json。
- 日誌：.local/package/three-second-baseline.log；整理程式：.local/package/summarize-three-second-baseline.mjs。
- 測試程序 PID 425368、session 4690，cwd 為目前 cpp worktree；臨時 HTTP port 動態配置（最後觀測 2683），由實際瀏覽器載入與完整推論驗證服務。測試器 finally 關閉瀏覽器及伺服器，完成後確認該程序及其 listener 不存在。

## README 舊數字的口徑

README 的 Browser 套件實測中 4.126／9.709／6.922 秒是先前引擎對齊欄位；個別歌曲效能表的 8.683／15.162／13.364 秒是先前原型的推論耗時記錄。它們不是同一流程／計時範圍，均不可替代本次 operationSeconds 基準。

<!-- ITERATIONS -->
## 持續改進紀錄

狀態：最終正式九次全數通過。下表保留所有測量與淘汰候選，當前預設與最終結論以上方驗收區為準。

- 第一輪假說：時間壓縮可減少 encoder 視窗數。實測 scale4 雖變快，但 SUNEO-ISM 缺失句超出額度、春泥棒 MAE 約 19.736 秒，淘汰。
- 第二輪方向：直接以已知歌詞批次解碼，避免逐 token 詞彙掃描；縮短 native 音訊 context 降低 encoder 計算量，同步調整視窗長度、重疊與時間換算。
- 負載觀察：第二輪與另一個 `.local/package/accept-browser.mjs` Chrome 測試同時執行，採樣系統忙碌接近 100%。不能把此批速度直接歸因於程式差異；保留結果，正式驗收須無其他同時推論。未停止其他程序。
- 驗收已改為 operationSeconds ≤3；3.001 秒失敗、3 秒通過的測試已觀察 RED→GREEN。4 倍時間座標至原始 PCM 的奇數尾段測試亦 RED→GREEN。

### 1792801194443-profile-scale

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792801194443-profile-scale/`。

設定：`[{"engine":{"profile":true},"threads":8,"id":"baseline-t8"},{"engine":{"timeScale":4,"profile":true},"threads":4,"id":"scale4-t4"},{"engine":{"timeScale":4,"profile":true},"threads":8,"id":"scale4-t8"}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| baseline-t8 | grace 1 | 4.123 | 0.464 | 1/12 | 通過 | 未通過 | 83.292% |
| baseline-t8 | haru 1 | 8.048 | 0.432 | 5/56 | 通過 | 未通過 | 80.341% |
| baseline-t8 | suneo 1 | 12.806 | 0.225 | 12/125 | 通過 | 未通過 | 80.572% |
| scale4-t4 | grace 1 | 3.538 | 0.624 | 1/12 | 通過 | 未通過 | 60.544% |
| scale4-t4 | haru 1 | 5.751 | 19.736 | 5/56 | 失敗 | 未通過 | 44.496% |
| scale4-t4 | suneo 1 | 8.253 | 無效 | 12/125 | 失敗 | 未通過 | 45.660% |
| scale4-t8 | grace 1 | 3.120 | 0.624 | 1/12 | 通過 | 未通過 | 80.982% |
| scale4-t8 | haru 1 | 6.459 | 19.736 | 5/56 | 失敗 | 未通過 | 86.815% |
| scale4-t8 | suneo 1 | 6.757 | 無效 | 12/125 | 失敗 | 未通過 | 62.989% |

### 1792801306592-short-context

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792801306592-short-context/`。

設定：`[{"id":"guided-c1500-s2","engine":{"profile":true,"guided":true},"threads":8},{"id":"guided-c750-s2","engine":{"audioContext":750,"guided":true,"profile":true},"threads":8},{"id":"guided-c375-s2","engine":{"audioContext":375,"guided":true,"profile":true},"threads":8},{"id":"guided-c750-s3","engine":{"audioContext":750,"guided":true,"timeScale":3,"profile":true},"threads":8}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| guided-c1500-s2 | grace 1 | 31.195 | 0.464 | 1/12 | 通過 | 未通過 | 99.993% |
| guided-c1500-s2 | haru 1 | 49.154 | 0.432 | 5/56 | 通過 | 未通過 | 99.563% |
| guided-c1500-s2 | suneo 1 | 47.458 | 0.220 | 12/125 | 通過 | 未通過 | 99.949% |
| guided-c750-s2 | grace 1 | 6.179 | 0.609 | 1/12 | 通過 | 未通過 | 100.000% |
| guided-c750-s2 | haru 1 | 7.527 | 10.722 | 5/56 | 失敗 | 未通過 | 95.100% |
| guided-c750-s2 | suneo 1 | 8.620 | 27.238 | 12/125 | 失敗 | 未通過 | 91.902% |

### 1792801566250-context-and-threads

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792801566250-context-and-threads/`。

設定：`[{"threads":4,"engine":{"audioContext":375,"guided":true,"profile":true},"id":"guided-c375-s2-t4"},{"threads":4,"engine":{"audioContext":750,"timeScale":3,"guided":true,"profile":true},"id":"guided-c750-s3-t4"},{"threads":4,"engine":{"guided":true,"profile":true},"id":"guided-c1500-s2-t4"},{"threads":4,"engine":{"timeScale":3,"guided":true,"profile":true},"id":"guided-c1500-s3-t4"}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| guided-c1500-s2-t4 | grace 1 | 4.273 | 0.464 | 1/12 | 通過 | 未通過 | 65.084% |
| guided-c1500-s2-t4 | haru 1 | 7.842 | 0.432 | 5/56 | 通過 | 未通過 | 56.000% |
| guided-c1500-s2-t4 | suneo 1 | 9.112 | 0.220 | 12/125 | 通過 | 未通過 | 54.420% |
| guided-c1500-s3-t4 | grace 1 | 3.038 | 0.791 | 1/12 | 通過 | 未通過 | 54.774% |
| guided-c1500-s3-t4 | haru 1 | 6.073 | 0.560 | 5/56 | 通過 | 未通過 | 55.775% |
| guided-c1500-s3-t4 | suneo 1 | 7.913 | 無效 | 12/125 | 失敗 | 未通過 | 59.011% |
| guided-c375-s2-t4 | grace 1 | 2.547 | 45.216 | 1/12 | 失敗 | 未通過 | 48.261% |
| guided-c375-s2-t4 | haru 1 | 6.723 | 74.943 | 5/56 | 失敗 | 未通過 | 78.140% |
| guided-c375-s2-t4 | suneo 1 | 5.671 | 50.273 | 12/125 | 失敗 | 未通過 | 43.371% |
| guided-c750-s3-t4 | grace 1 | 2.660 | 0.789 | 1/12 | 通過 | 通過 | 68.268% |
| guided-c750-s3-t4 | haru 1 | 4.419 | 0.687 | 5/56 | 通過 | 未通過 | 41.374% |
| guided-c750-s3-t4 | suneo 1 | 5.843 | 50.762 | 12/125 | 失敗 | 未通過 | 70.855% |

### 1792801762879-flash-collapse

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792801762879-flash-collapse/`。

設定：`[{"threads":8,"id":"flash-s2-t8","engine":{"profile":true,"encoderMode":1,"guided":true}},{"threads":12,"id":"flash-s2-t12","engine":{"profile":true,"encoderMode":1,"guided":true}},{"threads":8,"id":"collapse8-c750-s2-t8","engine":{"collapseLimit":8,"audioContext":750,"profile":true,"guided":true}},{"threads":8,"id":"collapse8-c750-s3-t8","engine":{"collapseLimit":8,"audioContext":750,"timeScale":3,"profile":true,"guided":true}},{"threads":8,"id":"collapse8-c375-s2-t8","engine":{"collapseLimit":8,"audioContext":375,"profile":true,"guided":true}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| collapse8-c375-s2-t8 | grace 1 | 6.029 | 32.665 | 1/12 | 失敗 | 未通過 | 99.859% |
| collapse8-c375-s2-t8 | haru 1 | 6.062 | 19.164 | 5/56 | 失敗 | 未通過 | 91.196% |
| collapse8-c375-s2-t8 | suneo 1 | 13.560 | 無效 | 12/125 | 失敗 | 未通過 | 97.346% |
| collapse8-c750-s2-t8 | grace 1 | 2.594 | 0.609 | 1/12 | 通過 | 通過 | 79.108% |
| collapse8-c750-s2-t8 | haru 1 | 5.656 | 9.255 | 5/56 | 失敗 | 未通過 | 86.885% |
| collapse8-c750-s2-t8 | suneo 1 | 6.296 | 無效 | 12/125 | 失敗 | 未通過 | 80.681% |
| collapse8-c750-s3-t8 | grace 1 | 2.016 | 0.789 | 1/12 | 通過 | 通過 | 79.544% |
| collapse8-c750-s3-t8 | haru 1 | 3.868 | 52.997 | 5/56 | 失敗 | 未通過 | 81.321% |
| collapse8-c750-s3-t8 | suneo 1 | 5.048 | 無效 | 12/125 | 失敗 | 未通過 | 81.570% |
| flash-s2-t12 | grace 1 | 22.275 | 0.478 | 1/12 | 通過 | 未通過 | 99.115% |
| flash-s2-t12 | haru 1 | 12.988 | 0.432 | 5/56 | 通過 | 未通過 | 96.181% |
| flash-s2-t12 | suneo 1 | 27.595 | 0.228 | 12/125 | 通過 | 未通過 | 96.922% |
| flash-s2-t8 | grace 1 | 6.680 | 0.478 | 1/12 | 通過 | 未通過 | 77.783% |
| flash-s2-t8 | haru 1 | 9.641 | 0.432 | 5/56 | 通過 | 未通過 | 80.948% |
| flash-s2-t8 | suneo 1 | 10.225 | 0.228 | 12/125 | 通過 | 未通過 | 73.179% |

### 1792802103410-sparse-encoder

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792802103410-sparse-encoder/`。

設定：`[{"engine":{"encoderMode":2,"profile":true,"guided":true},"threads":8,"id":"sparse2"},{"engine":{"encoderMode":3,"profile":true,"guided":true},"threads":8,"id":"sparse4"},{"engine":{"encoderMode":4,"profile":true,"guided":true},"threads":8,"id":"sparse8"},{"engine":{"encoderMode":4,"batchSize":440,"profile":true,"guided":true,"attentionStride":4},"threads":8,"id":"sparse8-b440-a4"}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| sparse2 | grace 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: RuntimeError: Aborted(). Build with -sASSERTIONS for more info.     at Worker.<anonymous> (http://127.0.0.1:4479/dist/index.js:208:21) | — |
| sparse2 | haru 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: RuntimeError: Aborted(). Build with -sASSERTIONS for more info.     at Worker.<anonymous> (http://127.0.0.1:4495/dist/index.js:208:21) | — |
| sparse2 | suneo 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: RuntimeError: Aborted(). Build with -sASSERTIONS for more info.     at Worker.<anonymous> (http://127.0.0.1:4489/dist/index.js:208:21) | — |
| sparse4 | grace 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: RuntimeError: Aborted(). Build with -sASSERTIONS for more info.     at Worker.<anonymous> (http://127.0.0.1:4501/dist/index.js:208:21) | — |
| sparse4 | haru 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: RuntimeError: Aborted(). Build with -sASSERTIONS for more info.     at Worker.<anonymous> (http://127.0.0.1:4513/dist/index.js:208:21) | — |
| sparse4 | suneo 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: RuntimeError: Aborted(). Build with -sASSERTIONS for more info.     at Worker.<anonymous> (http://127.0.0.1:4507/dist/index.js:208:21) | — |
| sparse8-b440-a4 | grace 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: RuntimeError: Aborted(). Build with -sASSERTIONS for more info.     at Worker.<anonymous> (http://127.0.0.1:4542/dist/index.js:208:21) | — |
| sparse8-b440-a4 | haru 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: RuntimeError: Aborted(). Build with -sASSERTIONS for more info.     at Worker.<anonymous> (http://127.0.0.1:4555/dist/index.js:208:21) | — |
| sparse8-b440-a4 | suneo 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: RuntimeError: Aborted(). Build with -sASSERTIONS for more info.     at Worker.<anonymous> (http://127.0.0.1:4548/dist/index.js:208:21) | — |
| sparse8 | grace 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: RuntimeError: Aborted(). Build with -sASSERTIONS for more info.     at Worker.<anonymous> (http://127.0.0.1:4520/dist/index.js:208:21) | — |
| sparse8 | haru 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: RuntimeError: Aborted(). Build with -sASSERTIONS for more info.     at Worker.<anonymous> (http://127.0.0.1:4536/dist/index.js:208:21) | — |
| sparse8 | suneo 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: RuntimeError: Aborted(). Build with -sASSERTIONS for more info.     at Worker.<anonymous> (http://127.0.0.1:4527/dist/index.js:208:21) | — |

### 1792802137690-debug-sparse

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792802137690-debug-sparse/`。

設定：`[{"engine":{"guided":true,"debugNative":true,"encoderMode":2,"profile":true},"threads":8,"id":"debug"}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| debug | grace 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: RuntimeError: Aborted(). Build with -sASSERTIONS for more info.     at Worker.<anonymous> (http://127.0.0.1:4567/dist/index.js:208:21) | — |

### 1792802608052-sparse-encoder

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792802608052-sparse-encoder/`。

設定：`[{"engine":{"encoderMode":2,"profile":true,"guided":true},"threads":8,"id":"sparse2"},{"engine":{"encoderMode":3,"profile":true,"guided":true},"threads":8,"id":"sparse4"},{"engine":{"encoderMode":4,"profile":true,"guided":true},"threads":8,"id":"sparse8"},{"engine":{"encoderMode":4,"batchSize":440,"profile":true,"guided":true,"attentionStride":4},"threads":8,"id":"sparse8-b440-a4"}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| sparse2 | grace 1 | 2.929 | 0.576 | 1/12 | 通過 | 通過 | 84.163% |
| sparse2 | haru 1 | 5.484 | 33.059 | 5/56 | 失敗 | 未通過 | 82.304% |
| sparse2 | suneo 1 | 6.392 | 無效 | 12/125 | 失敗 | 未通過 | 75.668% |
| sparse4 | grace 1 | 2.693 | 17.140 | 1/12 | 失敗 | 未通過 | 85.834% |
| sparse4 | haru 1 | 4.674 | 75.672 | 5/56 | 失敗 | 未通過 | 71.995% |
| sparse4 | suneo 1 | 5.745 | 29.520 | 12/125 | 失敗 | 未通過 | 69.197% |
| sparse8-b440-a4 | grace 1 | 2.490 | 31.691 | 1/12 | 失敗 | 未通過 | 85.503% |
| sparse8-b440-a4 | haru 1 | 4.342 | 92.743 | 5/56 | 失敗 | 未通過 | 77.175% |
| sparse8-b440-a4 | suneo 1 | 5.195 | 無效 | 12/125 | 失敗 | 未通過 | 76.807% |
| sparse8 | grace 1 | 2.264 | 44.631 | 1/12 | 失敗 | 未通過 | 76.376% |
| sparse8 | haru 1 | 3.862 | 67.407 | 5/56 | 失敗 | 未通過 | 70.827% |
| sparse8 | suneo 1 | 4.952 | 54.143 | 12/125 | 失敗 | 未通過 | 66.424% |

### 1792802855766-encoder-resample

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792802855766-encoder-resample/`。

設定：`[{"id":"enc2-b440-a4","threads":8,"engine":{"guided":true,"encoderMode":9,"profile":true,"batchSize":440,"attentionStride":4}},{"id":"enc3-b440-a4","threads":8,"engine":{"guided":true,"encoderMode":10,"profile":true,"batchSize":440,"attentionStride":4}},{"id":"enc4-b440-a4","threads":8,"engine":{"guided":true,"encoderMode":11,"profile":true,"batchSize":440,"attentionStride":4}},{"id":"base-b440-a4","threads":8,"engine":{"guided":true,"profile":true,"batchSize":440,"attentionStride":4}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| base-b440-a4 | grace 1 | 3.583 | 0.453 | 1/12 | 通過 | 未通過 | 87.834% |
| base-b440-a4 | haru 1 | 6.176 | 0.327 | 5/56 | 通過 | 未通過 | 82.402% |
| base-b440-a4 | suneo 1 | 7.012 | 0.179 | 12/125 | 通過 | 未通過 | 81.919% |
| enc2-b440-a4 | grace 1 | 3.844 | 0.598 | 1/12 | 通過 | 未通過 | 98.994% |
| enc2-b440-a4 | haru 1 | 16.117 | 47.441 | 5/56 | 失敗 | 未通過 | 98.828% |
| enc2-b440-a4 | suneo 1 | 12.199 | 無效 | 12/125 | 失敗 | 未通過 | 96.755% |
| enc3-b440-a4 | grace 1 | 2.421 | 44.631 | 1/12 | 失敗 | 未通過 | 92.228% |
| enc3-b440-a4 | haru 1 | 3.327 | 61.797 | 5/56 | 失敗 | 未通過 | 87.305% |
| enc3-b440-a4 | suneo 1 | 5.107 | 48.614 | 12/125 | 失敗 | 未通過 | 90.320% |
| enc4-b440-a4 | grace 1 | 1.700 | 44.631 | 1/12 | 失敗 | 未通過 | 84.154% |
| enc4-b440-a4 | haru 1 | 2.800 | 67.407 | 5/56 | 失敗 | 未通過 | 79.829% |
| enc4-b440-a4 | suneo 1 | 3.754 | 54.744 | 12/125 | 失敗 | 未通過 | 81.025% |

### 1792803232049-kernel42-guided

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792803232049-kernel42-guided/`。

設定：`[{"engine":{"attentionStride":4,"profile":true,"batchSize":440,"guided":true},"threads":8,"id":"kernel42-b440-a4-t8"},{"engine":{"profile":true,"alignmentOnly":true,"attentionStride":4,"batchSize":440,"debugNative":true,"guided":true},"threads":8,"id":"only-b440-a4-t8"},{"engine":{"alignmentOnly":true,"attentionStride":4,"profile":true,"batchSize":440,"guided":true},"threads":6,"id":"only-b440-a4-t6"},{"engine":{"alignmentOnly":true,"attentionStride":4,"profile":true,"batchSize":440,"guided":true},"threads":4,"id":"only-b440-a4-t4"}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| kernel42-b440-a4-t8 | grace 1 | 3.633 | 0.453 | 1/12 | 通過 | 未通過 | 96.657% |
| kernel42-b440-a4-t8 | haru 1 | 5.267 | 0.324 | 5/56 | 通過 | 未通過 | 85.539% |
| kernel42-b440-a4-t8 | suneo 1 | 6.300 | 0.179 | 12/125 | 通過 | 未通過 | 84.426% |
| only-b440-a4-t4 | grace 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: RuntimeError: Aborted(). Build with -sASSERTIONS for more info.     at Worker.<anonymous> (http://127.0.0.1:5534/dist/index.js:208:21) | — |
| only-b440-a4-t4 | haru 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: Error: unwind     at Worker.<anonymous> (http://127.0.0.1:5548/dist/index.js:208:21) | — |
| only-b440-a4-t4 | suneo 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: Error: unwind     at Worker.<anonymous> (http://127.0.0.1:5541/dist/index.js:208:21) | — |
| only-b440-a4-t6 | grace 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: Error: unwind     at Worker.<anonymous> (http://127.0.0.1:5511/dist/index.js:208:21) | — |
| only-b440-a4-t6 | haru 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: Error: unwind     at Worker.<anonymous> (http://127.0.0.1:5524/dist/index.js:208:21) | — |
| only-b440-a4-t6 | suneo 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: Error: unwind     at Worker.<anonymous> (http://127.0.0.1:5517/dist/index.js:208:21) | — |
| only-b440-a4-t8 | grace 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: Error: unwind     at Worker.<anonymous> (http://127.0.0.1:5493/dist/index.js:208:21) | — |
| only-b440-a4-t8 | haru 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: Error: unwind     at Worker.<anonymous> (http://127.0.0.1:5505/dist/index.js:208:21) | — |
| only-b440-a4-t8 | suneo 1 | 錯誤 | — | — | 未完成 | 失敗：Error: page.evaluate: RuntimeError: Aborted(). Build with -sASSERTIONS for more info.     at Worker.<anonymous> (http://127.0.0.1:5499/dist/index.js:208:21) | — |

### 1792803713352-prepack-fractions

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792803713352-prepack-fractions/`。

設定：`[{"id":"only-pack-s2-t6","threads":6,"engine":{"attentionStride":4,"profile":true,"alignmentOnly":true,"batchSize":440,"prepack":true,"debugNative":true,"guided":true}},{"id":"only-pack-s225-t6","threads":6,"engine":{"attentionStride":4,"batchSize":440,"alignmentOnly":true,"prepack":true,"timeScale":2.25,"profile":true,"guided":true}},{"id":"only-pack-s25-t6","threads":6,"engine":{"attentionStride":4,"batchSize":440,"alignmentOnly":true,"prepack":true,"timeScale":2.5,"profile":true,"guided":true}},{"id":"only-pack-s275-t6","threads":6,"engine":{"attentionStride":4,"batchSize":440,"alignmentOnly":true,"prepack":true,"timeScale":2.75,"profile":true,"guided":true}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| only-pack-s2-t6 | grace 1 | 5.147 | 0.453 | 1/12 | 通過 | 未通過 | 72.955% |
| only-pack-s2-t6 | haru 1 | 9.150 | 0.324 | 5/56 | 通過 | 未通過 | 64.463% |
| only-pack-s2-t6 | suneo 1 | 10.278 | 0.179 | 12/125 | 通過 | 未通過 | 69.275% |
| only-pack-s225-t6 | grace 1 | 5.039 | 0.523 | 1/12 | 通過 | 未通過 | 72.747% |
| only-pack-s225-t6 | haru 1 | 9.067 | 0.264 | 5/56 | 通過 | 未通過 | 61.743% |
| only-pack-s225-t6 | suneo 1 | 10.083 | 2.521 | 12/125 | 失敗 | 未通過 | 61.675% |
| only-pack-s25-t6 | grace 1 | 3.627 | 0.700 | 1/12 | 通過 | 未通過 | 56.687% |
| only-pack-s25-t6 | haru 1 | 8.472 | 0.340 | 5/56 | 通過 | 未通過 | 76.923% |
| only-pack-s25-t6 | suneo 1 | 8.517 | 0.357 | 12/125 | 通過 | 未通過 | 54.555% |
| only-pack-s275-t6 | grace 1 | 6.675 | 0.485 | 1/12 | 通過 | 未通過 | 99.052% |
| only-pack-s275-t6 | haru 1 | 9.083 | 0.446 | 5/56 | 通過 | 未通過 | 81.293% |
| only-pack-s275-t6 | suneo 1 | 11.479 | 0.579 | 12/125 | 通過 | 未通過 | 76.462% |

### 1792803984865-fixed-output-overlap

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792803984865-fixed-output-overlap/`。

設定：`[{"id":"s25-overlap50-t8","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"timeScale":2.5,"overlapFrames":50}},{"id":"s275-overlap50-t8","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"timeScale":2.75,"overlapFrames":50}},{"id":"s25-overlap100-t8","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"timeScale":2.5,"overlapFrames":100}},{"id":"s25-overlap50-t4","threads":4,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"timeScale":2.5,"overlapFrames":50}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| s25-overlap100-t8 | grace 1 | 2.324 | 0.482 | 1/12 | 通過 | 通過 | 70.385% |
| s25-overlap100-t8 | haru 1 | 5.667 | 0.411 | 5/56 | 通過 | 未通過 | 90.089% |
| s25-overlap100-t8 | suneo 1 | 5.324 | 0.399 | 12/125 | 通過 | 未通過 | 75.033% |
| s25-overlap50-t4 | grace 1 | 3.955 | 0.491 | 1/12 | 通過 | 未通過 | 92.338% |
| s25-overlap50-t4 | haru 1 | 7.172 | 0.427 | 5/56 | 通過 | 未通過 | 81.439% |
| s25-overlap50-t4 | suneo 1 | 7.642 | 3.955 | 12/125 | 失敗 | 未通過 | 62.338% |
| s25-overlap50-t8 | grace 1 | 2.319 | 0.491 | 1/12 | 通過 | 通過 | 71.506% |
| s25-overlap50-t8 | haru 1 | 4.920 | 0.427 | 5/56 | 通過 | 未通過 | 88.001% |
| s25-overlap50-t8 | suneo 1 | 5.092 | 3.955 | 12/125 | 失敗 | 未通過 | 64.631% |
| s275-overlap50-t8 | grace 1 | 2.435 | 0.607 | 1/12 | 通過 | 通過 | 75.339% |
| s275-overlap50-t8 | haru 1 | 4.110 | 0.342 | 5/56 | 通過 | 未通過 | 73.158% |
| s275-overlap50-t8 | suneo 1 | 7.333 | 無效 | 12/125 | 失敗 | 未通過 | 58.875% |

### 1792804188339-intermediate-context

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792804188339-intermediate-context/`。

設定：`[{"id":"context-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1000,"timeScale":2.5}},{"id":"context-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5}},{"id":"context-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1000,"timeScale":2.75}},{"id":"context-3","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.75}},{"id":"context-4","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1500,"timeScale":2.5}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| context-0 | grace 1 | 1.996 | 1.002 | 1/12 | 失敗 | 未通過 | 66.294% |
| context-0 | haru 1 | 3.637 | 0.290 | 5/56 | 通過 | 未通過 | 76.248% |
| context-0 | suneo 1 | 4.466 | 11.740 | 12/125 | 失敗 | 未通過 | 71.188% |
| context-1 | grace 1 | 2.399 | 0.655 | 1/12 | 通過 | 通過 | 74.884% |
| context-1 | haru 1 | 4.218 | 0.326 | 5/56 | 通過 | 未通過 | 79.724% |
| context-1 | suneo 1 | 4.775 | 0.416 | 12/125 | 通過 | 未通過 | 74.134% |
| context-2 | grace 1 | 1.949 | 0.515 | 1/12 | 通過 | 通過 | 66.416% |
| context-2 | haru 1 | 3.546 | 0.307 | 5/56 | 通過 | 未通過 | 66.025% |
| context-2 | suneo 1 | 4.050 | 21.966 | 12/125 | 失敗 | 未通過 | 66.747% |
| context-3 | grace 1 | 2.372 | 0.477 | 1/12 | 通過 | 通過 | 73.545% |
| context-3 | haru 1 | 4.225 | 0.286 | 5/56 | 通過 | 未通過 | 70.851% |
| context-3 | suneo 1 | 4.752 | 4.741 | 12/125 | 失敗 | 未通過 | 63.795% |
| context-4 | grace 1 | 2.342 | 0.700 | 1/12 | 通過 | 通過 | 67.977% |
| context-4 | haru 1 | 4.501 | 0.340 | 5/56 | 通過 | 未通過 | 71.817% |
| context-4 | suneo 1 | 5.127 | 0.357 | 12/125 | 通過 | 未通過 | 64.196% |

### 1792804521974-tile48-layer-ablation

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792804521974-tile48-layer-ablation/`。

設定：`[{"id":"layer-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"encoderMode":0}},{"id":"layer-14","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"encoderMode":14}},{"id":"layer-15","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"encoderMode":15}},{"id":"layer-16","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"encoderMode":16}},{"id":"layer-17","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"encoderMode":17}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| layer-0 | grace 1 | 2.297 | 0.636 | 1/12 | 通過 | 通過 | 72.707% |
| layer-0 | haru 1 | 4.285 | 0.330 | 5/56 | 通過 | 未通過 | 70.836% |
| layer-0 | suneo 1 | 4.844 | 0.411 | 12/125 | 通過 | 未通過 | 67.214% |
| layer-14 | grace 1 | 1.973 | 44.058 | 1/12 | 失敗 | 未通過 | 71.891% |
| layer-14 | haru 1 | 3.345 | 67.577 | 5/56 | 失敗 | 未通過 | 71.176% |
| layer-14 | suneo 1 | 3.816 | 56.006 | 12/125 | 失敗 | 未通過 | 67.418% |
| layer-15 | grace 1 | 1.896 | 13.409 | 1/12 | 失敗 | 未通過 | 68.830% |
| layer-15 | haru 1 | 3.746 | 62.752 | 5/56 | 失敗 | 未通過 | 76.279% |
| layer-15 | suneo 1 | 4.276 | 無效 | 12/125 | 失敗 | 未通過 | 65.359% |
| layer-16 | grace 1 | 1.969 | 33.895 | 1/12 | 失敗 | 未通過 | 76.272% |
| layer-16 | haru 1 | 3.589 | 106.541 | 5/56 | 失敗 | 未通過 | 71.159% |
| layer-16 | suneo 1 | 4.077 | 14.239 | 12/125 | 失敗 | 未通過 | 69.626% |
| layer-17 | grace 1 | 1.989 | 1.502 | 1/12 | 失敗 | 未通過 | 70.313% |
| layer-17 | haru 1 | 3.478 | 5.752 | 5/56 | 失敗 | 未通過 | 73.075% |
| layer-17 | suneo 1 | 4.410 | 無效 | 12/125 | 失敗 | 未通過 | 72.037% |

### 1792804592334-prefix-guard

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792804592334-prefix-guard/`。

設定：`[{"id":"guard-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1000,"timeScale":2.5,"collapseLimit":4}},{"id":"guard-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1000,"timeScale":2.75,"collapseLimit":4}},{"id":"guard-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1000,"timeScale":2.5,"lookaheadRatio":1}},{"id":"guard-3","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":3,"collapseLimit":4}},{"id":"guard-4","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":3,"lookaheadRatio":1}},{"id":"guard-5","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":3.25,"collapseLimit":4}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| guard-0 | grace 1 | 2.043 | 1.002 | 1/12 | 失敗 | 未通過 | 84.970% |
| guard-0 | haru 1 | 3.598 | 0.258 | 5/56 | 通過 | 未通過 | 77.701% |
| guard-0 | suneo 1 | 4.683 | 無效 | 12/125 | 失敗 | 未通過 | 76.605% |
| guard-1 | grace 1 | 2.100 | 0.515 | 1/12 | 通過 | 通過 | 87.500% |
| guard-1 | haru 1 | 3.789 | 13.343 | 5/56 | 失敗 | 未通過 | 77.956% |
| guard-1 | suneo 1 | 4.737 | 無效 | 12/125 | 失敗 | 未通過 | 79.181% |
| guard-2 | grace 1 | 2.216 | 1.002 | 1/12 | 失敗 | 未通過 | 84.511% |
| guard-2 | haru 1 | 3.510 | 0.258 | 5/56 | 通過 | 未通過 | 71.374% |
| guard-2 | suneo 1 | 4.559 | 8.349 | 12/125 | 失敗 | 未通過 | 78.305% |
| guard-3 | grace 1 | 1.921 | 0.842 | 1/12 | 通過 | 通過 | 71.156% |
| guard-3 | haru 1 | 3.843 | 93.757 | 5/56 | 失敗 | 未通過 | 71.032% |
| guard-3 | suneo 1 | 4.797 | 無效 | 12/125 | 失敗 | 未通過 | 68.807% |
| guard-4 | grace 1 | 2.075 | 0.842 | 1/12 | 通過 | 通過 | 74.218% |
| guard-4 | haru 1 | 3.764 | 0.298 | 5/56 | 通過 | 未通過 | 79.648% |
| guard-4 | suneo 1 | 4.135 | 10.691 | 12/125 | 失敗 | 未通過 | 65.860% |
| guard-5 | grace 1 | 1.829 | 0.621 | 1/12 | 通過 | 通過 | 70.607% |
| guard-5 | haru 1 | 4.658 | 106.633 | 5/56 | 失敗 | 未通過 | 89.291% |
| guard-5 | suneo 1 | 7.275 | 無效 | 12/125 | 失敗 | 未通過 | 88.539% |

### 1792804798353-pointwise-mlp

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792804798353-pointwise-mlp/`。

設定：`[{"id":"mlp-18","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"encoderMode":18}},{"id":"mlp-19","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"encoderMode":19}},{"id":"mlp-20","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"encoderMode":20}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| mlp-18 | grace 1 | 2.453 | 0.665 | 1/12 | 通過 | 通過 | 79.715% |
| mlp-18 | haru 1 | 3.972 | 44.305 | 5/56 | 失敗 | 未通過 | 72.916% |
| mlp-18 | suneo 1 | 4.484 | 56.006 | 12/125 | 失敗 | 未通過 | 66.832% |
| mlp-19 | grace 1 | 2.608 | 1.036 | 1/12 | 失敗 | 未通過 | 79.808% |
| mlp-19 | haru 1 | 3.954 | 67.577 | 5/56 | 失敗 | 未通過 | 79.164% |
| mlp-19 | suneo 1 | 4.599 | 56.006 | 12/125 | 失敗 | 未通過 | 76.848% |
| mlp-20 | grace 1 | 2.436 | 2.847 | 1/12 | 失敗 | 未通過 | 79.402% |
| mlp-20 | haru 1 | 3.845 | 67.577 | 5/56 | 失敗 | 未通過 | 75.311% |
| mlp-20 | suneo 1 | 4.405 | 56.006 | 12/125 | 失敗 | 未通過 | 76.198% |

### 1792805056187-mel-pooling

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792805056187-mel-pooling/`。

設定：`[{"id":"pool-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"melPool":1,"timeScale":3,"audioContext":1250}},{"id":"pool-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"melPool":1,"timeScale":3.5,"audioContext":1250}},{"id":"pool-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"melPool":2,"timeScale":3,"audioContext":1250}},{"id":"pool-3","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"melPool":2,"timeScale":3.5,"audioContext":1250}},{"id":"pool-4","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"melPool":1,"timeScale":2.5,"audioContext":1000}},{"id":"pool-5","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"melPool":2,"timeScale":2.5,"audioContext":1000}},{"id":"pool-c750-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":750,"timeScale":3,"melPool":1}},{"id":"pool-c750-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":750,"timeScale":3,"melPool":2}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| pool-0 | grace 1 | 1.934 | 0.776 | 1/12 | 通過 | 通過 | 77.304% |
| pool-0 | haru 1 | 3.949 | 0.372 | 5/56 | 通過 | 未通過 | 84.304% |
| pool-0 | suneo 1 | 4.707 | 5.368 | 12/125 | 失敗 | 未通過 | 87.473% |
| pool-1 | grace 1 | 2.432 | 0.582 | 1/12 | 通過 | 通過 | 86.563% |
| pool-1 | haru 1 | 3.339 | 0.651 | 5/56 | 通過 | 未通過 | 82.751% |
| pool-1 | suneo 1 | 4.176 | 19.813 | 12/125 | 失敗 | 未通過 | 87.986% |
| pool-2 | grace 1 | 1.931 | 0.842 | 1/12 | 通過 | 通過 | 81.106% |
| pool-2 | haru 1 | 4.527 | 0.456 | 5/56 | 通過 | 未通過 | 95.510% |
| pool-2 | suneo 1 | 4.509 | 28.557 | 12/125 | 失敗 | 未通過 | 85.896% |
| pool-3 | grace 1 | 1.858 | 0.811 | 1/12 | 通過 | 通過 | 72.116% |
| pool-3 | haru 1 | 3.204 | 1.597 | 5/56 | 失敗 | 未通過 | 75.493% |
| pool-3 | suneo 1 | 3.705 | 25.495 | 12/125 | 失敗 | 未通過 | 71.520% |
| pool-4 | grace 1 | 1.972 | 0.965 | 1/12 | 通過 | 通過 | 78.960% |
| pool-4 | haru 1 | 3.498 | 0.236 | 5/56 | 通過 | 未通過 | 67.829% |
| pool-4 | suneo 1 | 4.230 | 11.241 | 12/125 | 失敗 | 未通過 | 66.178% |
| pool-5 | grace 1 | 1.882 | 1.038 | 1/12 | 失敗 | 未通過 | 75.483% |
| pool-5 | haru 1 | 3.365 | 0.278 | 5/56 | 通過 | 未通過 | 65.961% |
| pool-5 | suneo 1 | 4.319 | 11.716 | 12/125 | 失敗 | 未通過 | 69.156% |
| pool-c750-1 | grace 1 | 1.678 | 0.649 | 1/12 | 通過 | 通過 | 68.577% |
| pool-c750-1 | haru 1 | 3.428 | 0.284 | 5/56 | 通過 | 未通過 | 87.211% |
| pool-c750-1 | suneo 1 | 3.847 | 38.572 | 12/125 | 失敗 | 未通過 | 77.876% |
| pool-c750-2 | grace 1 | 1.720 | 0.795 | 1/12 | 通過 | 通過 | 68.312% |
| pool-c750-2 | haru 1 | 3.920 | 0.323 | 5/56 | 通過 | 未通過 | 94.886% |
| pool-c750-2 | suneo 1 | 3.967 | 38.270 | 12/125 | 失敗 | 未通過 | 79.432% |

### 1792805192873-exact-thread-sweep

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792805192873-exact-thread-sweep/`。

設定：`[{"id":"c1250-t2","threads":2,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5}},{"id":"c1250-t4","threads":4,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5}},{"id":"c1250-t6","threads":6,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5}},{"id":"c1500-t2","threads":2,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1500,"timeScale":2.5}},{"id":"c1500-t4","threads":4,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1500,"timeScale":2.5}},{"id":"c1500-t6","threads":6,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1500,"timeScale":2.5}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| c1250-t2 | grace 1 | 3.862 | 0.655 | 1/12 | 通過 | 未通過 | 34.438% |
| c1250-t2 | haru 1 | 8.025 | 0.326 | 5/56 | 通過 | 未通過 | 38.707% |
| c1250-t2 | suneo 1 | 9.144 | 0.416 | 12/125 | 通過 | 未通過 | 33.975% |
| c1250-t4 | grace 1 | 2.962 | 0.655 | 1/12 | 通過 | 通過 | 56.413% |
| c1250-t4 | haru 1 | 4.788 | 0.326 | 5/56 | 通過 | 未通過 | 35.735% |
| c1250-t4 | suneo 1 | 6.286 | 0.416 | 12/125 | 通過 | 未通過 | 49.051% |
| c1250-t6 | grace 1 | 2.413 | 0.655 | 1/12 | 通過 | 通過 | 54.863% |
| c1250-t6 | haru 1 | 4.509 | 0.326 | 5/56 | 通過 | 未通過 | 62.036% |
| c1250-t6 | suneo 1 | 5.473 | 0.416 | 12/125 | 通過 | 未通過 | 67.356% |
| c1500-t2 | grace 1 | 3.572 | 0.700 | 1/12 | 通過 | 未通過 | 39.250% |
| c1500-t2 | haru 1 | 7.779 | 0.340 | 5/56 | 通過 | 未通過 | 29.374% |
| c1500-t2 | suneo 1 | 9.846 | 0.357 | 12/125 | 通過 | 未通過 | 37.827% |
| c1500-t4 | grace 1 | 2.551 | 0.700 | 1/12 | 通過 | 通過 | 45.047% |
| c1500-t4 | haru 1 | 7.699 | 0.340 | 5/56 | 通過 | 未通過 | 85.645% |
| c1500-t4 | suneo 1 | 6.453 | 0.357 | 12/125 | 通過 | 未通過 | 43.656% |
| c1500-t6 | grace 1 | 2.896 | 0.700 | 1/12 | 通過 | 通過 | 86.843% |
| c1500-t6 | haru 1 | 6.587 | 0.340 | 5/56 | 通過 | 未通過 | 91.900% |
| c1500-t6 | suneo 1 | 6.370 | 0.357 | 12/125 | 通過 | 未通過 | 74.812% |

### 1792805786871-quantized-attention

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792805786871-quantized-attention/`。

設定：`[{"id":"qattn-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"attentionQuant":true,"audioContext":1250,"timeScale":2.5}},{"id":"qattn-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"attentionQuant":true,"audioContext":1500,"timeScale":2.5}},{"id":"qattn-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"attentionQuant":true,"audioContext":1500,"timeScale":2.75}},{"id":"qattn-3","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"attentionQuant":true,"audioContext":1500,"timeScale":2}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| qattn-0 | grace 1 | 3.079 | 0.655 | 1/12 | 通過 | 未通過 | 93.118% |
| qattn-0 | haru 1 | 8.198 | 0.342 | 5/56 | 通過 | 未通過 | 95.954% |
| qattn-0 | suneo 1 | 6.264 | 0.409 | 12/125 | 通過 | 未通過 | 87.485% |
| qattn-1 | grace 1 | 3.644 | 0.718 | 1/12 | 通過 | 未通過 | 99.354% |
| qattn-1 | haru 1 | 4.661 | 0.346 | 5/56 | 通過 | 未通過 | 67.878% |
| qattn-1 | suneo 1 | 6.216 | 0.357 | 12/125 | 通過 | 未通過 | 84.421% |
| qattn-2 | grace 1 | 2.320 | 0.545 | 1/12 | 通過 | 通過 | 73.591% |
| qattn-2 | haru 1 | 5.163 | 0.444 | 5/56 | 通過 | 未通過 | 85.378% |
| qattn-2 | suneo 1 | 5.723 | 0.643 | 12/125 | 通過 | 未通過 | 76.150% |
| qattn-3 | grace 1 | 3.030 | 0.467 | 1/12 | 通過 | 未通過 | 79.086% |
| qattn-3 | haru 1 | 5.620 | 0.352 | 5/56 | 通過 | 未通過 | 80.712% |
| qattn-3 | suneo 1 | 6.360 | 0.178 | 12/125 | 通過 | 未通過 | 78.529% |

### 1792806114131-simd-quantizer-overlap

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792806114131-simd-quantizer-overlap/`。

設定：`[{"id":"simdq-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"attentionQuant":true,"audioContext":1250,"timeScale":2.5}},{"id":"simdq-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"attentionQuant":true,"audioContext":1500,"timeScale":2.75}},{"id":"simdq-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"attentionQuant":true,"audioContext":1250,"timeScale":2.5,"overlapFrames":0}},{"id":"simdq-3","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"attentionQuant":true,"audioContext":1250,"timeScale":2.5,"overlapFrames":100}},{"id":"simdq-4","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"attentionQuant":true,"audioContext":1250,"timeScale":2.75,"overlapFrames":0}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| simdq-0 | grace 1 | 2.614 | 0.636 | 1/12 | 通過 | 通過 | 90.576% |
| simdq-0 | haru 1 | 4.511 | 0.346 | 5/56 | 通過 | 未通過 | 88.345% |
| simdq-0 | suneo 1 | 5.425 | 0.392 | 12/125 | 通過 | 未通過 | 86.483% |
| simdq-1 | grace 1 | 2.303 | 0.505 | 1/12 | 通過 | 通過 | 89.728% |
| simdq-1 | haru 1 | 4.368 | 0.438 | 5/56 | 通過 | 未通過 | 82.989% |
| simdq-1 | suneo 1 | 5.467 | 0.619 | 12/125 | 通過 | 未通過 | 83.276% |
| simdq-2 | grace 1 | 2.376 | 7.698 | 1/12 | 失敗 | 未通過 | 83.548% |
| simdq-2 | haru 1 | 3.415 | 11.688 | 5/56 | 失敗 | 未通過 | 77.859% |
| simdq-2 | suneo 1 | 3.957 | 10.693 | 12/125 | 失敗 | 未通過 | 74.748% |
| simdq-3 | grace 1 | 2.198 | 0.716 | 1/12 | 通過 | 通過 | 69.156% |
| simdq-3 | haru 1 | 4.117 | 0.291 | 5/56 | 通過 | 未通過 | 75.581% |
| simdq-3 | suneo 1 | 4.302 | 4.075 | 12/125 | 失敗 | 未通過 | 64.652% |
| simdq-4 | grace 1 | 1.890 | 5.821 | 1/12 | 失敗 | 未通過 | 82.675% |
| simdq-4 | haru 1 | 3.308 | 16.672 | 5/56 | 失敗 | 未通過 | 68.625% |
| simdq-4 | suneo 1 | 4.092 | 8.259 | 12/125 | 失敗 | 未通過 | 76.477% |

### 1792806561338-expanded-model-weights

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792806561338-expanded-model-weights/`。

設定：`[{"id":"floatw-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"float","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5}},{"id":"floatw-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"float","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1500,"timeScale":2.75}},{"id":"floatw-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"float","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"attentionQuant":true}},{"id":"floatw-3","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"float","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1500,"timeScale":2.75,"attentionQuant":true}},{"id":"floatw-4","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| floatw-0 | grace 1 | 2.408 | 0.673 | 1/12 | 通過 | 通過 | 75.575% |
| floatw-0 | haru 1 | 4.526 | 0.358 | 5/56 | 通過 | 未通過 | 74.999% |
| floatw-0 | suneo 1 | 5.099 | 0.313 | 12/125 | 通過 | 未通過 | 66.378% |
| floatw-1 | grace 1 | 2.316 | 0.485 | 1/12 | 通過 | 通過 | 70.617% |
| floatw-1 | haru 1 | 4.679 | 0.432 | 5/56 | 通過 | 未通過 | 69.972% |
| floatw-1 | suneo 1 | 5.498 | 0.526 | 12/125 | 通過 | 未通過 | 70.674% |
| floatw-2 | grace 1 | 2.399 | 0.691 | 1/12 | 通過 | 通過 | 81.432% |
| floatw-2 | haru 1 | 4.351 | 0.342 | 5/56 | 通過 | 未通過 | 77.365% |
| floatw-2 | suneo 1 | 4.967 | 0.352 | 12/125 | 通過 | 未通過 | 79.990% |
| floatw-3 | grace 1 | 2.387 | 0.485 | 1/12 | 通過 | 通過 | 88.746% |
| floatw-3 | haru 1 | 4.531 | 0.424 | 5/56 | 通過 | 未通過 | 71.045% |
| floatw-3 | suneo 1 | 5.733 | 0.464 | 12/125 | 通過 | 未通過 | 79.633% |
| floatw-4 | grace 1 | 2.328 | 0.655 | 1/12 | 通過 | 通過 | 74.072% |
| floatw-4 | haru 1 | 4.020 | 0.326 | 5/56 | 通過 | 未通過 | 69.503% |
| floatw-4 | suneo 1 | 4.616 | 0.416 | 12/125 | 通過 | 未通過 | 66.353% |

### 1792806961194-kernel-profile

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792806961194-kernel-profile/`。

設定：`[{"id":"kernels-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"prepack":true}},{"id":"kernels-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"prepack":"float"}},{"id":"kernels-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"prepack":true,"attentionQuant":true}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| kernels-0 | grace 1 | 2.347 | 0.655 | 1/12 | 通過 | 通過 | 74.886% |
| kernels-0 | haru 1 | 3.946 | 0.326 | 5/56 | 通過 | 未通過 | 71.912% |
| kernels-0 | suneo 1 | 4.643 | 0.416 | 12/125 | 通過 | 未通過 | 65.197% |
| kernels-1 | grace 1 | 2.432 | 0.673 | 1/12 | 通過 | 通過 | 72.350% |
| kernels-1 | haru 1 | 4.598 | 0.358 | 5/56 | 通過 | 未通過 | 83.719% |
| kernels-1 | suneo 1 | 4.975 | 0.313 | 12/125 | 通過 | 未通過 | 68.783% |
| kernels-2 | grace 1 | 2.500 | 0.636 | 1/12 | 通過 | 通過 | 90.429% |
| kernels-2 | haru 1 | 4.145 | 0.346 | 5/56 | 通過 | 未通過 | 81.631% |
| kernels-2 | suneo 1 | 4.545 | 0.392 | 12/125 | 通過 | 未通過 | 73.474% |

### 1792807871473-grouped-integer-and-activations

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792807871473-grouped-integer-and-activations/`。

設定：`[{"id":"group-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true}},{"id":"group-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5}},{"id":"group-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"attentionQuant":2}},{"id":"group-3","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"attentionQuant":2}},{"id":"group-4","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"attentionQuant":2,"vectorActivations":true}},{"id":"group-5","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1500,"timeScale":2.75,"attentionQuant":2,"vectorActivations":true}},{"id":"group-6","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| group-0 | grace 1 | 2.102 | 0.655 | 1/12 | 通過 | 通過 | 72.636% |
| group-0 | haru 1 | 3.697 | 0.316 | 5/56 | 通過 | 未通過 | 73.295% |
| group-0 | suneo 1 | 4.325 | 0.410 | 12/125 | 通過 | 未通過 | 64.638% |
| group-1 | grace 1 | 2.733 | 0.673 | 1/12 | 通過 | 通過 | 75.708% |
| group-1 | haru 1 | 5.114 | 0.362 | 5/56 | 通過 | 未通過 | 79.856% |
| group-1 | suneo 1 | 5.887 | 0.388 | 12/125 | 通過 | 未通過 | 76.063% |
| group-2 | grace 1 | 2.731 | 0.673 | 1/12 | 通過 | 通過 | 84.613% |
| group-2 | haru 1 | 4.756 | 0.343 | 5/56 | 通過 | 未通過 | 76.457% |
| group-2 | suneo 1 | 5.674 | 0.460 | 12/125 | 通過 | 未通過 | 75.707% |
| group-3 | grace 1 | 3.031 | 0.691 | 1/12 | 通過 | 未通過 | 78.203% |
| group-3 | haru 1 | 5.576 | 0.326 | 5/56 | 通過 | 未通過 | 71.063% |
| group-3 | suneo 1 | 6.958 | 0.339 | 12/125 | 通過 | 未通過 | 75.246% |
| group-4 | grace 1 | 2.892 | 0.673 | 1/12 | 通過 | 通過 | 70.044% |
| group-4 | haru 1 | 5.350 | 0.351 | 5/56 | 通過 | 未通過 | 68.705% |
| group-4 | suneo 1 | 6.278 | 0.357 | 12/125 | 通過 | 未通過 | 67.406% |
| group-5 | grace 1 | 2.791 | 0.465 | 1/12 | 通過 | 通過 | 73.411% |
| group-5 | haru 1 | 5.774 | 0.427 | 5/56 | 通過 | 未通過 | 67.387% |
| group-5 | suneo 1 | 6.852 | 0.513 | 12/125 | 通過 | 未通過 | 70.589% |
| group-6 | grace 1 | 2.302 | 0.655 | 1/12 | 通過 | 通過 | 75.368% |
| group-6 | haru 1 | 3.888 | 0.326 | 5/56 | 通過 | 未通過 | 70.213% |
| group-6 | suneo 1 | 4.510 | 0.416 | 12/125 | 通過 | 未通過 | 65.673% |

### 1792808155544-fixed-group-tiles

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792808155544-fixed-group-tiles/`。

設定：`[{"id":"tile-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true}},{"id":"tile-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2}},{"id":"tile-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2}},{"id":"tile-3","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| tile-0 | grace 1 | 2.117 | 0.673 | 1/12 | 通過 | 通過 | 77.745% |
| tile-0 | haru 1 | 3.572 | 0.362 | 5/56 | 通過 | 未通過 | 67.696% |
| tile-0 | suneo 1 | 4.205 | 0.352 | 12/125 | 通過 | 未通過 | 65.718% |
| tile-1 | grace 1 | 2.391 | 0.636 | 1/12 | 通過 | 通過 | 78.045% |
| tile-1 | haru 1 | 3.790 | 0.371 | 5/56 | 通過 | 未通過 | 69.770% |
| tile-1 | suneo 1 | 4.486 | 0.464 | 12/125 | 通過 | 未通過 | 68.522% |
| tile-2 | grace 1 | 2.124 | 0.673 | 1/12 | 通過 | 通過 | 76.641% |
| tile-2 | haru 1 | 3.682 | 0.351 | 5/56 | 通過 | 未通過 | 69.851% |
| tile-2 | suneo 1 | 4.279 | 0.357 | 12/125 | 通過 | 未通過 | 69.172% |
| tile-3 | grace 1 | 2.068 | 0.655 | 1/12 | 通過 | 通過 | 69.546% |
| tile-3 | haru 1 | 3.682 | 0.316 | 5/56 | 通過 | 未通過 | 67.364% |
| tile-3 | suneo 1 | 4.357 | 0.410 | 12/125 | 通過 | 未通過 | 68.039% |

### 1792808230888-short-context-lookahead

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792808230888-short-context-lookahead/`。

設定：`[{"id":"look-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":750,"timeScale":3,"vectorActivations":true,"lookaheadRatio":1.5}},{"id":"look-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":750,"timeScale":3,"vectorActivations":true,"lookaheadRatio":2}},{"id":"look-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1000,"timeScale":3,"vectorActivations":true,"lookaheadRatio":1.5}},{"id":"look-3","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1000,"timeScale":3,"vectorActivations":true,"lookaheadRatio":2}},{"id":"look-full-3","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1500,"timeScale":3,"vectorActivations":true,"lookaheadRatio":1.5}},{"id":"look-full-3.5","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1500,"timeScale":3.5,"vectorActivations":true,"lookaheadRatio":1.5}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| look-0 | grace 1 | 1.915 | 0.715 | 1/12 | 通過 | 通過 | 76.496% |
| look-0 | haru 1 | 3.037 | 0.277 | 5/56 | 通過 | 未通過 | 75.807% |
| look-0 | suneo 1 | 3.128 | 55.275 | 12/125 | 失敗 | 未通過 | 64.981% |
| look-1 | grace 1 | 2.028 | 0.715 | 1/12 | 通過 | 通過 | 78.435% |
| look-1 | haru 1 | 3.039 | 0.277 | 5/56 | 通過 | 未通過 | 68.349% |
| look-1 | suneo 1 | 3.321 | 68.702 | 12/125 | 失敗 | 未通過 | 68.183% |
| look-2 | grace 1 | 2.007 | 0.585 | 1/12 | 通過 | 通過 | 79.301% |
| look-2 | haru 1 | 3.260 | 0.260 | 5/56 | 通過 | 未通過 | 73.839% |
| look-2 | suneo 1 | 3.612 | 68.431 | 12/125 | 失敗 | 未通過 | 71.144% |
| look-3 | grace 1 | 1.844 | 0.585 | 1/12 | 通過 | 通過 | 78.237% |
| look-3 | haru 1 | 3.154 | 0.260 | 5/56 | 通過 | 未通過 | 67.139% |
| look-3 | suneo 1 | 3.694 | 69.663 | 12/125 | 失敗 | 未通過 | 75.347% |
| look-full-3 | grace 1 | 2.028 | 0.802 | 1/12 | 通過 | 通過 | 72.802% |
| look-full-3 | haru 1 | 3.422 | 0.327 | 5/56 | 通過 | 未通過 | 66.719% |
| look-full-3 | suneo 1 | 4.115 | 無效 | 12/125 | 失敗 | 未通過 | 64.426% |

### 1792808310281-full-context-scale35

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792808310281-full-context-scale35/`。

設定：`[{"id":"look-full-35","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1500,"timeScale":3.5,"vectorActivations":true,"lookaheadRatio":1.5}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| look-full-35 | grace 1 | 2.253 | 0.615 | 1/12 | 通過 | 通過 | 81.702% |
| look-full-35 | haru 1 | 3.464 | 0.875 | 5/56 | 通過 | 未通過 | 69.134% |
| look-full-35 | suneo 1 | 4.096 | 無效 | 12/125 | 失敗 | 未通過 | 67.485% |

### 1792808575872-head-sized-quant-and-radix-five

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792808575872-head-sized-quant-and-radix-five/`。

設定：`[{"id":"head64-both","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2}},{"id":"head64-weights","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true}},{"id":"head64-attention","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2}},{"id":"head64-control","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| head64-attention | grace 1 | 2.512 | 0.655 | 1/12 | 通過 | 通過 | 86.555% |
| head64-attention | haru 1 | 3.849 | 0.324 | 5/56 | 通過 | 未通過 | 78.343% |
| head64-attention | suneo 1 | 4.443 | 0.430 | 12/125 | 通過 | 未通過 | 73.510% |
| head64-both | grace 1 | 1.995 | 0.673 | 1/12 | 通過 | 通過 | 70.617% |
| head64-both | haru 1 | 3.541 | 0.340 | 5/56 | 通過 | 未通過 | 68.498% |
| head64-both | suneo 1 | 4.217 | 0.363 | 12/125 | 通過 | 未通過 | 69.399% |
| head64-control | grace 1 | 2.093 | 0.636 | 1/12 | 通過 | 通過 | 72.319% |
| head64-control | haru 1 | 3.706 | 0.334 | 5/56 | 通過 | 未通過 | 71.415% |
| head64-control | suneo 1 | 4.293 | 0.406 | 12/125 | 通過 | 未通過 | 65.047% |
| head64-weights | grace 1 | 2.044 | 0.673 | 1/12 | 通過 | 通過 | 74.948% |
| head64-weights | haru 1 | 3.576 | 0.363 | 5/56 | 通過 | 未通過 | 76.677% |
| head64-weights | suneo 1 | 4.200 | 0.359 | 12/125 | 通過 | 未通過 | 75.688% |

### 1792808803689-rowwise-integer-accumulation

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792808803689-rowwise-integer-accumulation/`。

設定：`[{"id":"row-both","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2}},{"id":"row-weights","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true}},{"id":"row-attention","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2}},{"id":"row-control","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":true,"batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| row-attention | grace 1 | 2.049 | 0.655 | 1/12 | 通過 | 通過 | 71.718% |
| row-attention | haru 1 | 3.597 | 0.347 | 5/56 | 通過 | 未通過 | 75.437% |
| row-attention | suneo 1 | 4.247 | 0.412 | 12/125 | 通過 | 未通過 | 73.096% |
| row-both | grace 1 | 1.888 | 0.673 | 1/12 | 通過 | 通過 | 71.107% |
| row-both | haru 1 | 3.215 | 0.354 | 5/56 | 通過 | 未通過 | 65.255% |
| row-both | suneo 1 | 3.924 | 0.325 | 12/125 | 通過 | 未通過 | 66.435% |
| row-control | grace 1 | 2.217 | 0.636 | 1/12 | 通過 | 通過 | 83.247% |
| row-control | haru 1 | 3.675 | 0.334 | 5/56 | 通過 | 未通過 | 75.931% |
| row-control | suneo 1 | 4.350 | 0.406 | 12/125 | 通過 | 未通過 | 73.167% |
| row-weights | grace 1 | 2.003 | 0.673 | 1/12 | 通過 | 通過 | 70.801% |
| row-weights | haru 1 | 3.753 | 0.351 | 5/56 | 通過 | 未通過 | 77.665% |
| row-weights | suneo 1 | 3.966 | 0.351 | 12/125 | 通過 | 未通過 | 63.170% |

### 1792809087551-pooled-encoder-attention

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792809087551-pooled-encoder-attention/`。

設定：`[{"id":"poolkv-21","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"encoderMode":21}},{"id":"poolkv-26","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"encoderMode":26}},{"id":"poolkv-27","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"encoderMode":27}},{"id":"poolkv-22","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"encoderMode":22}},{"id":"poolkv-23","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"encoderMode":23}},{"id":"poolkv-24","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"encoderMode":24}},{"id":"poolkv-25","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"encoderMode":25}},{"id":"poolkv-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"encoderMode":0}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| poolkv-0 | grace 1 | 1.870 | 0.673 | 1/12 | 通過 | 通過 | 70.996% |
| poolkv-0 | haru 1 | 3.340 | 0.354 | 5/56 | 通過 | 未通過 | 70.841% |
| poolkv-0 | suneo 1 | 3.886 | 0.325 | 12/125 | 通過 | 未通過 | 62.590% |
| poolkv-21 | grace 1 | 1.842 | 0.651 | 1/12 | 通過 | 通過 | 71.691% |
| poolkv-21 | haru 1 | 3.366 | 0.954 | 5/56 | 通過 | 未通過 | 67.853% |
| poolkv-21 | suneo 1 | 3.635 | 4.558 | 12/125 | 失敗 | 未通過 | 64.652% |
| poolkv-22 | grace 1 | 1.886 | 0.636 | 1/12 | 通過 | 通過 | 72.145% |
| poolkv-22 | haru 1 | 3.238 | 0.382 | 5/56 | 通過 | 未通過 | 67.019% |
| poolkv-22 | suneo 1 | 3.965 | 0.682 | 12/125 | 通過 | 未通過 | 66.871% |
| poolkv-23 | grace 1 | 1.893 | 0.691 | 1/12 | 通過 | 通過 | 71.499% |
| poolkv-23 | haru 1 | 3.205 | 0.331 | 5/56 | 通過 | 未通過 | 72.011% |
| poolkv-23 | suneo 1 | 3.919 | 0.345 | 12/125 | 通過 | 未通過 | 68.101% |
| poolkv-24 | grace 1 | 1.891 | 0.655 | 1/12 | 通過 | 通過 | 79.592% |
| poolkv-24 | haru 1 | 3.424 | 0.410 | 5/56 | 通過 | 未通過 | 83.603% |
| poolkv-24 | suneo 1 | 4.156 | 0.412 | 12/125 | 通過 | 未通過 | 78.363% |
| poolkv-25 | grace 1 | 1.932 | 0.705 | 1/12 | 通過 | 通過 | 79.339% |
| poolkv-25 | haru 1 | 3.304 | 0.332 | 5/56 | 通過 | 未通過 | 76.748% |
| poolkv-25 | suneo 1 | 3.887 | 0.518 | 12/125 | 通過 | 未通過 | 72.147% |
| poolkv-26 | grace 1 | 1.909 | 0.673 | 1/12 | 通過 | 通過 | 73.221% |
| poolkv-26 | haru 1 | 3.213 | 0.375 | 5/56 | 通過 | 未通過 | 71.566% |
| poolkv-26 | suneo 1 | 3.686 | 1.572 | 12/125 | 失敗 | 未通過 | 64.136% |
| poolkv-27 | grace 1 | 1.914 | 0.618 | 1/12 | 通過 | 通過 | 78.547% |
| poolkv-27 | haru 1 | 3.232 | 0.495 | 5/56 | 通過 | 未通過 | 75.686% |
| poolkv-27 | suneo 1 | 3.830 | 0.620 | 12/125 | 通過 | 未通過 | 66.518% |

### 1792809194996-rowwise-path-and-lookahead

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792809194996-rowwise-path-and-lookahead/`。

設定：`[{"id":"path-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":8,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"lookaheadRatio":1}},{"id":"path-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":16,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"lookaheadRatio":1}},{"id":"path-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":8,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2}},{"id":"path-3","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"lookaheadRatio":1}},{"id":"path-4","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| path-0 | grace 1 | 2.113 | 0.615 | 1/12 | 通過 | 通過 | 81.122% |
| path-0 | haru 1 | 3.519 | 0.331 | 5/56 | 通過 | 未通過 | 84.076% |
| path-0 | suneo 1 | 3.765 | 1.832 | 12/125 | 失敗 | 未通過 | 74.386% |
| path-1 | grace 1 | 2.281 | 0.560 | 1/12 | 通過 | 通過 | 82.599% |
| path-1 | haru 1 | 3.378 | 0.518 | 5/56 | 通過 | 未通過 | 73.628% |
| path-1 | suneo 1 | 3.762 | 0.744 | 12/125 | 通過 | 未通過 | 70.568% |
| path-2 | grace 1 | 1.883 | 0.615 | 1/12 | 通過 | 通過 | 69.135% |
| path-2 | haru 1 | 3.481 | 0.345 | 5/56 | 通過 | 未通過 | 77.270% |
| path-2 | suneo 1 | 3.861 | 3.171 | 12/125 | 失敗 | 未通過 | 65.439% |
| path-3 | grace 1 | 1.984 | 0.673 | 1/12 | 通過 | 通過 | 79.047% |
| path-3 | haru 1 | 3.532 | 0.365 | 5/56 | 通過 | 未通過 | 82.177% |
| path-3 | suneo 1 | 3.902 | 0.313 | 12/125 | 通過 | 未通過 | 75.680% |
| path-4 | grace 1 | 1.977 | 0.673 | 1/12 | 通過 | 通過 | 79.325% |
| path-4 | haru 1 | 3.320 | 0.354 | 5/56 | 通過 | 未通過 | 71.106% |
| path-4 | suneo 1 | 4.364 | 0.325 | 12/125 | 通過 | 未通過 | 78.022% |

### 1792809358837-fractional-feature-context

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792809358837-fractional-feature-context/`。

設定：`[{"id":"frac-28","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"encoderMode":28}},{"id":"frac-29","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"encoderMode":29}},{"id":"frac-30","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"encoderMode":30}},{"id":"frac-31","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"encoderMode":31}},{"id":"frac-32","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"encoderMode":32}},{"id":"frac-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"encoderMode":0}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| frac-0 | grace 1 | 1.883 | 0.673 | 1/12 | 通過 | 通過 | 68.516% |
| frac-0 | haru 1 | 3.304 | 0.354 | 5/56 | 通過 | 未通過 | 70.505% |
| frac-0 | suneo 1 | 4.252 | 0.325 | 12/125 | 通過 | 未通過 | 71.233% |
| frac-28 | grace 1 | 1.909 | 0.651 | 1/12 | 通過 | 通過 | 75.771% |
| frac-28 | haru 1 | 3.170 | 0.409 | 5/56 | 通過 | 未通過 | 66.729% |
| frac-28 | suneo 1 | 3.708 | 0.844 | 12/125 | 通過 | 未通過 | 64.758% |
| frac-29 | grace 1 | 1.686 | 0.560 | 1/12 | 通過 | 通過 | 67.668% |
| frac-29 | haru 1 | 3.109 | 0.411 | 5/56 | 通過 | 未通過 | 71.931% |
| frac-29 | suneo 1 | 3.439 | 7.656 | 12/125 | 失敗 | 未通過 | 61.800% |
| frac-30 | grace 1 | 1.963 | 0.542 | 1/12 | 通過 | 通過 | 84.993% |
| frac-30 | haru 1 | 2.816 | 0.700 | 5/56 | 通過 | 通過 | 71.807% |
| frac-30 | suneo 1 | 3.384 | 2.240 | 12/125 | 失敗 | 未通過 | 67.964% |
| frac-31 | grace 1 | 1.984 | 0.655 | 1/12 | 通過 | 通過 | 80.022% |
| frac-31 | haru 1 | 3.131 | 0.349 | 5/56 | 通過 | 未通過 | 76.333% |
| frac-31 | suneo 1 | 3.821 | 8.500 | 12/125 | 失敗 | 未通過 | 71.606% |
| frac-32 | grace 1 | 2.040 | 0.636 | 1/12 | 通過 | 通過 | 76.396% |
| frac-32 | haru 1 | 3.385 | 0.418 | 5/56 | 通過 | 未通過 | 76.731% |
| frac-32 | suneo 1 | 4.004 | 0.993 | 12/125 | 通過 | 未通過 | 72.743% |

### 1792809588702-trim-final-context

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792809588702-trim-final-context/`。

設定：`[{"id":"trim-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true}},{"id":"trim-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"encoderMode":28}},{"id":"trim-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1500,"timeScale":2.75,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true}},{"id":"trim-3","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":16,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"lookaheadRatio":1}},{"id":"trim-4","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":16,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"encoderMode":28,"lookaheadRatio":1}},{"id":"trim-5","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| trim-0 | grace 1 | 1.715 | 0.673 | 1/12 | 通過 | 通過 | 71.035% |
| trim-0 | haru 1 | 3.516 | 0.362 | 5/56 | 通過 | 未通過 | 75.875% |
| trim-0 | suneo 1 | 3.665 | 0.330 | 12/125 | 通過 | 未通過 | 64.456% |
| trim-1 | grace 1 | 1.680 | 0.651 | 1/12 | 通過 | 通過 | 69.648% |
| trim-1 | haru 1 | 3.054 | 0.405 | 5/56 | 通過 | 未通過 | 72.636% |
| trim-1 | suneo 1 | 3.658 | 0.850 | 12/125 | 通過 | 未通過 | 66.363% |
| trim-2 | grace 1 | 1.746 | 0.525 | 1/12 | 通過 | 通過 | 71.007% |
| trim-2 | haru 1 | 3.375 | 0.427 | 5/56 | 通過 | 未通過 | 76.669% |
| trim-2 | suneo 1 | 3.834 | 0.505 | 12/125 | 通過 | 未通過 | 63.750% |
| trim-3 | grace 1 | 1.654 | 0.560 | 1/12 | 通過 | 通過 | 71.901% |
| trim-3 | haru 1 | 3.236 | 0.533 | 5/56 | 通過 | 未通過 | 82.840% |
| trim-3 | suneo 1 | 3.996 | 0.756 | 12/125 | 通過 | 未通過 | 76.218% |
| trim-4 | grace 1 | 1.669 | 0.705 | 1/12 | 通過 | 通過 | 81.175% |
| trim-4 | haru 1 | 3.045 | 0.656 | 5/56 | 通過 | 未通過 | 80.844% |
| trim-4 | suneo 1 | 3.781 | 4.555 | 12/125 | 失敗 | 未通過 | 84.693% |
| trim-5 | grace 1 | 2.136 | 0.673 | 1/12 | 通過 | 通過 | 88.108% |
| trim-5 | haru 1 | 3.526 | 0.354 | 5/56 | 通過 | 未通過 | 80.261% |
| trim-5 | suneo 1 | 4.090 | 0.325 | 12/125 | 通過 | 未通過 | 77.196% |

### 1792809692729-constant-physical-window

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792809692729-constant-physical-window/`。

設定：`[{"id":"physical-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1136,"timeScale":2.75,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true}},{"id":"physical-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1040,"timeScale":3,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true}},{"id":"physical-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true}},{"id":"physical-3","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":896,"timeScale":3.5,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true}},{"id":"physical-4","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":832,"timeScale":3.75,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true}},{"id":"physical-5","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":784,"timeScale":4,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true}},{"id":"physical-6","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| physical-0 | grace 1 | 1.570 | 0.631 | 1/12 | 通過 | 通過 | 72.806% |
| physical-0 | haru 1 | 3.028 | 0.321 | 5/56 | 通過 | 未通過 | 78.381% |
| physical-0 | suneo 1 | 3.436 | 26.216 | 12/125 | 失敗 | 未通過 | 71.292% |
| physical-1 | grace 1 | 1.629 | 0.662 | 1/12 | 通過 | 通過 | 75.663% |
| physical-1 | haru 1 | 2.815 | 0.269 | 5/56 | 通過 | 通過 | 73.341% |
| physical-1 | suneo 1 | 3.090 | 34.839 | 12/125 | 失敗 | 未通過 | 68.316% |
| physical-2 | grace 1 | 1.553 | 0.629 | 1/12 | 通過 | 通過 | 87.512% |
| physical-2 | haru 1 | 2.548 | 0.266 | 5/56 | 通過 | 通過 | 77.708% |
| physical-2 | suneo 1 | 3.206 | 1.609 | 12/125 | 失敗 | 未通過 | 77.843% |
| physical-3 | grace 1 | 1.537 | 0.663 | 1/12 | 通過 | 通過 | 82.152% |
| physical-3 | haru 1 | 2.371 | 0.508 | 5/56 | 通過 | 通過 | 77.166% |
| physical-3 | suneo 1 | 3.390 | 11.857 | 12/125 | 失敗 | 未通過 | 82.071% |
| physical-4 | grace 1 | 1.474 | 0.721 | 1/12 | 通過 | 通過 | 83.351% |
| physical-4 | haru 1 | 2.276 | 0.945 | 5/56 | 通過 | 通過 | 71.927% |
| physical-4 | suneo 1 | 2.775 | 56.191 | 12/125 | 失敗 | 未通過 | 76.228% |
| physical-5 | grace 1 | 1.416 | 0.656 | 1/12 | 通過 | 通過 | 73.217% |
| physical-5 | haru 1 | 2.292 | 1.353 | 5/56 | 失敗 | 未通過 | 70.022% |
| physical-5 | suneo 1 | 2.447 | 56.213 | 12/125 | 失敗 | 未通過 | 67.310% |
| physical-6 | grace 1 | 1.801 | 0.673 | 1/12 | 通過 | 通過 | 79.978% |
| physical-6 | haru 1 | 3.263 | 0.362 | 5/56 | 通過 | 未通過 | 71.097% |
| physical-6 | suneo 1 | 3.875 | 0.330 | 12/125 | 通過 | 未通過 | 68.888% |

### 1792809785473-compressed-path-candidates

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792809785473-compressed-path-candidates/`。

設定：`[{"id":"compressed-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"lookaheadRatio":1}},{"id":"compressed-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":8,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"lookaheadRatio":1}},{"id":"compressed-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":16,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"lookaheadRatio":1}},{"id":"compressed-3","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":32,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"lookaheadRatio":1}},{"id":"compressed-4","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":16,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true}},{"id":"compressed-5","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":8,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true}},{"id":"compressed-6","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| compressed-0 | grace 1 | 1.366 | 0.629 | 1/12 | 通過 | 通過 | 67.836% |
| compressed-0 | haru 1 | 2.439 | 0.286 | 5/56 | 通過 | 通過 | 71.620% |
| compressed-0 | suneo 1 | 3.119 | 2.251 | 12/125 | 失敗 | 未通過 | 68.354% |
| compressed-1 | grace 1 | 1.477 | 0.558 | 1/12 | 通過 | 通過 | 88.622% |
| compressed-1 | haru 1 | 2.649 | 0.391 | 5/56 | 通過 | 通過 | 80.390% |
| compressed-1 | suneo 1 | 3.014 | 2.075 | 12/125 | 失敗 | 未通過 | 72.854% |
| compressed-2 | grace 1 | 1.409 | 0.678 | 1/12 | 通過 | 通過 | 82.096% |
| compressed-2 | haru 1 | 2.542 | 0.839 | 5/56 | 通過 | 通過 | 81.355% |
| compressed-2 | suneo 1 | 3.120 | 2.682 | 12/125 | 失敗 | 未通過 | 82.399% |
| compressed-3 | grace 1 | 1.465 | 1.260 | 1/12 | 失敗 | 未通過 | 84.193% |
| compressed-3 | haru 1 | 2.565 | 1.133 | 5/56 | 失敗 | 未通過 | 82.945% |
| compressed-3 | suneo 1 | 3.180 | 4.373 | 12/125 | 失敗 | 未通過 | 83.601% |
| compressed-4 | grace 1 | 1.432 | 0.678 | 1/12 | 通過 | 通過 | 76.350% |
| compressed-4 | haru 1 | 2.626 | 0.749 | 5/56 | 通過 | 通過 | 77.316% |
| compressed-4 | suneo 1 | 3.110 | 4.475 | 12/125 | 失敗 | 未通過 | 80.241% |
| compressed-5 | grace 1 | 1.347 | 0.605 | 1/12 | 通過 | 通過 | 74.428% |
| compressed-5 | haru 1 | 2.502 | 0.401 | 5/56 | 通過 | 通過 | 71.708% |
| compressed-5 | suneo 1 | 3.050 | 2.035 | 12/125 | 失敗 | 未通過 | 69.269% |
| compressed-6 | grace 1 | 1.370 | 0.629 | 1/12 | 通過 | 通過 | 71.054% |
| compressed-6 | haru 1 | 2.619 | 0.266 | 5/56 | 通過 | 通過 | 72.319% |
| compressed-6 | suneo 1 | 3.303 | 1.609 | 12/125 | 失敗 | 未通過 | 74.921% |

### 1792809906954-attention-frame-normalization

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792809906954-attention-frame-normalization/`。

設定：`[{"id":"norm-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionMedianFilter":false}},{"id":"norm-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionNormalization":"frame"}},{"id":"norm-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionNormalization":"frame","attentionMedianFilter":false}},{"id":"norm-3","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":8,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionNormalization":"frame","attentionMedianFilter":false}},{"id":"norm-4","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":2,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionNormalization":"frame","attentionMedianFilter":false}},{"id":"norm-5","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1250,"timeScale":2.5,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionNormalization":"frame","attentionMedianFilter":false}},{"id":"norm-6","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| norm-0 | grace 1 | 1.367 | 0.747 | 1/12 | 通過 | 通過 | 75.281% |
| norm-0 | haru 1 | 2.606 | 0.289 | 5/56 | 通過 | 通過 | 71.925% |
| norm-0 | suneo 1 | 3.044 | 2.244 | 12/125 | 失敗 | 未通過 | 66.183% |
| norm-1 | grace 1 | 1.364 | 0.475 | 1/12 | 通過 | 通過 | 73.752% |
| norm-1 | haru 1 | 2.834 | 0.338 | 5/56 | 通過 | 通過 | 73.313% |
| norm-1 | suneo 1 | 3.257 | 1.889 | 12/125 | 失敗 | 未通過 | 74.659% |
| norm-2 | grace 1 | 1.406 | 0.560 | 1/12 | 通過 | 通過 | 76.294% |
| norm-2 | haru 1 | 2.568 | 0.312 | 5/56 | 通過 | 通過 | 73.131% |
| norm-2 | suneo 1 | 3.270 | 1.919 | 12/125 | 失敗 | 未通過 | 78.776% |
| norm-3 | grace 1 | 1.554 | 0.416 | 1/12 | 通過 | 通過 | 73.390% |
| norm-3 | haru 1 | 2.398 | 0.320 | 5/56 | 通過 | 通過 | 69.283% |
| norm-3 | suneo 1 | 2.979 | 1.912 | 12/125 | 失敗 | 未通過 | 66.802% |
| norm-4 | grace 1 | 1.373 | 0.606 | 1/12 | 通過 | 通過 | 71.616% |
| norm-4 | haru 1 | 2.601 | 0.308 | 5/56 | 通過 | 通過 | 79.519% |
| norm-4 | suneo 1 | 3.119 | 2.143 | 12/125 | 失敗 | 未通過 | 68.016% |
| norm-5 | grace 1 | 1.747 | 0.633 | 1/12 | 通過 | 通過 | 84.773% |
| norm-5 | haru 1 | 3.269 | 0.325 | 5/56 | 通過 | 未通過 | 79.191% |
| norm-5 | suneo 1 | 4.382 | 0.258 | 12/125 | 通過 | 未通過 | 79.795% |
| norm-6 | grace 1 | 1.392 | 0.629 | 1/12 | 通過 | 通過 | 77.048% |
| norm-6 | haru 1 | 2.656 | 0.266 | 5/56 | 通過 | 通過 | 81.919% |
| norm-6 | suneo 1 | 3.342 | 1.609 | 12/125 | 失敗 | 未通過 | 81.316% |

### 1792810038397-monotonic-attention-heads

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792810038397-monotonic-attention-heads/`。

設定：`[{"id":"heads-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionHeadCount":2}},{"id":"heads-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionHeadCount":3}},{"id":"heads-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionHeadCount":4}},{"id":"heads-3","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionHeadCount":2,"attentionNormalization":"frame","attentionMedianFilter":false}},{"id":"heads-4","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionHeadCount":3,"attentionNormalization":"frame","attentionMedianFilter":false}},{"id":"heads-5","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":8,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionHeadCount":3,"attentionMedianFilter":false}},{"id":"heads-6","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| heads-0 | grace 1 | 1.439 | 0.773 | 1/12 | 通過 | 通過 | 83.273% |
| heads-0 | haru 1 | 2.584 | 0.318 | 5/56 | 通過 | 通過 | 79.942% |
| heads-0 | suneo 1 | 3.116 | 2.104 | 12/125 | 失敗 | 未通過 | 74.970% |
| heads-1 | grace 1 | 1.430 | 0.615 | 1/12 | 通過 | 通過 | 81.998% |
| heads-1 | haru 1 | 2.598 | 0.304 | 5/56 | 通過 | 通過 | 78.862% |
| heads-1 | suneo 1 | 3.154 | 2.322 | 12/125 | 失敗 | 未通過 | 78.111% |
| heads-2 | grace 1 | 1.553 | 0.631 | 1/12 | 通過 | 通過 | 86.709% |
| heads-2 | haru 1 | 3.210 | 0.305 | 5/56 | 通過 | 未通過 | 89.038% |
| heads-2 | suneo 1 | 3.148 | 2.321 | 12/125 | 失敗 | 未通過 | 76.854% |
| heads-3 | grace 1 | 1.405 | 0.896 | 1/12 | 通過 | 通過 | 74.432% |
| heads-3 | haru 1 | 2.817 | 0.243 | 5/56 | 通過 | 通過 | 78.434% |
| heads-3 | suneo 1 | 3.344 | 1.895 | 12/125 | 失敗 | 未通過 | 78.121% |
| heads-4 | grace 1 | 1.376 | 0.731 | 1/12 | 通過 | 通過 | 74.237% |
| heads-4 | haru 1 | 2.420 | 0.252 | 5/56 | 通過 | 通過 | 71.973% |
| heads-4 | suneo 1 | 3.055 | 1.859 | 12/125 | 失敗 | 未通過 | 66.992% |
| heads-5 | grace 1 | 1.347 | 0.711 | 1/12 | 通過 | 通過 | 70.372% |
| heads-5 | haru 1 | 2.421 | 0.212 | 5/56 | 通過 | 通過 | 67.948% |
| heads-5 | suneo 1 | 3.056 | 1.856 | 12/125 | 失敗 | 未通過 | 68.991% |
| heads-6 | grace 1 | 1.385 | 0.629 | 1/12 | 通過 | 通過 | 71.441% |
| heads-6 | haru 1 | 2.586 | 0.266 | 5/56 | 通過 | 通過 | 72.453% |
| heads-6 | suneo 1 | 3.137 | 1.609 | 12/125 | 失敗 | 未通過 | 76.845% |

### 1792810183967-alignment-position-prior

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792810183967-alignment-position-prior/`。

設定：`[{"id":"prior-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":1}},{"id":"prior-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":3}},{"id":"prior-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":10}},{"id":"prior-3","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":30}},{"id":"prior-4","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":10,"attentionNormalization":"frame","attentionMedianFilter":false}},{"id":"prior-5","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":1040,"timeScale":3,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":10}},{"id":"prior-6","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| prior-0 | grace 1 | 1.630 | 0.629 | 1/12 | 通過 | 通過 | 89.341% |
| prior-0 | haru 1 | 2.602 | 0.271 | 5/56 | 通過 | 通過 | 71.301% |
| prior-0 | suneo 1 | 3.035 | 2.291 | 12/125 | 失敗 | 未通過 | 65.607% |
| prior-1 | grace 1 | 1.612 | 0.615 | 1/12 | 通過 | 通過 | 77.413% |
| prior-1 | haru 1 | 2.493 | 0.281 | 5/56 | 通過 | 通過 | 72.400% |
| prior-1 | suneo 1 | 3.208 | 2.259 | 12/125 | 失敗 | 未通過 | 71.256% |
| prior-2 | grace 1 | 1.523 | 0.591 | 1/12 | 通過 | 通過 | 85.182% |
| prior-2 | haru 1 | 2.860 | 0.277 | 5/56 | 通過 | 通過 | 82.958% |
| prior-2 | suneo 1 | 3.131 | 0.970 | 12/125 | 通過 | 未通過 | 75.121% |
| prior-3 | grace 1 | 2.711 | 0.627 | 1/12 | 通過 | 通過 | 96.899% |
| prior-3 | haru 1 | 2.698 | 0.376 | 5/56 | 通過 | 通過 | 80.028% |
| prior-3 | suneo 1 | 3.236 | 4.057 | 12/125 | 失敗 | 未通過 | 78.958% |
| prior-4 | grace 1 | 1.662 | 0.536 | 1/12 | 通過 | 通過 | 83.363% |
| prior-4 | haru 1 | 2.471 | 0.311 | 5/56 | 通過 | 通過 | 69.159% |
| prior-4 | suneo 1 | 3.254 | 1.790 | 12/125 | 失敗 | 未通過 | 72.647% |
| prior-5 | grace 1 | 1.455 | 0.684 | 1/12 | 通過 | 通過 | 74.388% |
| prior-5 | haru 1 | 2.673 | 0.234 | 5/56 | 通過 | 通過 | 71.173% |
| prior-5 | suneo 1 | 3.357 | 24.760 | 12/125 | 失敗 | 未通過 | 71.140% |
| prior-6 | grace 1 | 1.775 | 0.629 | 1/12 | 通過 | 通過 | 90.408% |
| prior-6 | haru 1 | 2.582 | 0.266 | 5/56 | 通過 | 通過 | 72.326% |
| prior-6 | suneo 1 | 3.103 | 1.609 | 12/125 | 失敗 | 未通過 | 68.809% |

### 1792810305129-near-threshold-prior

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792810305129-near-threshold-prior/`。

設定：`[{"id":"near-0","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":8,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":7}},{"id":"near-1","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":8,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":10}},{"id":"near-2","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":8,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":12}},{"id":"near-3","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":8,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":15}},{"id":"near-4","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":10,"lookaheadRatio":1}},{"id":"near-5","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":896,"timeScale":3.5,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":10}},{"id":"near-6","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":8,"profile":true,"audioContext":896,"timeScale":3.5,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":10}},{"id":"near-7","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":false,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":10}},{"id":"near-8","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":10}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| near-0 | grace 1 | 1.680 | 0.536 | 1/12 | 通過 | 通過 | 90.366% |
| near-0 | haru 1 | 2.518 | 0.391 | 5/56 | 通過 | 通過 | 76.814% |
| near-0 | suneo 1 | 3.228 | 1.472 | 12/125 | 失敗 | 未通過 | 73.654% |
| near-1 | grace 1 | 1.567 | 0.620 | 1/12 | 通過 | 通過 | 81.968% |
| near-1 | haru 1 | 2.595 | 0.422 | 5/56 | 通過 | 通過 | 74.257% |
| near-1 | suneo 1 | 3.005 | 1.389 | 12/125 | 失敗 | 未通過 | 70.768% |
| near-2 | grace 1 | 1.618 | 0.595 | 1/12 | 通過 | 通過 | 81.048% |
| near-2 | haru 1 | 2.489 | 0.402 | 5/56 | 通過 | 通過 | 72.238% |
| near-2 | suneo 1 | 3.170 | 1.388 | 12/125 | 失敗 | 未通過 | 72.705% |
| near-3 | grace 1 | 1.354 | 0.642 | 1/12 | 通過 | 通過 | 71.583% |
| near-3 | haru 1 | 2.477 | 0.405 | 5/56 | 通過 | 通過 | 73.398% |
| near-3 | suneo 1 | 3.020 | 7.470 | 12/125 | 失敗 | 未通過 | 73.462% |
| near-4 | grace 1 | 1.351 | 0.591 | 1/12 | 通過 | 通過 | 72.847% |
| near-4 | haru 1 | 2.668 | 0.301 | 5/56 | 通過 | 通過 | 78.710% |
| near-4 | suneo 1 | 2.991 | 1.779 | 12/125 | 失敗 | 未通過 | 68.065% |
| near-5 | grace 1 | 1.520 | 0.637 | 1/12 | 通過 | 通過 | 73.795% |
| near-5 | haru 1 | 2.429 | 0.507 | 5/56 | 通過 | 通過 | 75.895% |
| near-5 | suneo 1 | 2.967 | 12.445 | 12/125 | 失敗 | 未通過 | 70.332% |
| near-6 | grace 1 | 1.540 | 0.643 | 1/12 | 通過 | 通過 | 80.167% |
| near-6 | haru 1 | 2.887 | 0.846 | 5/56 | 通過 | 通過 | 88.046% |
| near-6 | suneo 1 | 2.924 | 4.857 | 12/125 | 失敗 | 未通過 | 72.529% |
| near-7 | grace 1 | 1.417 | 0.591 | 1/12 | 通過 | 通過 | 83.747% |
| near-7 | haru 1 | 2.837 | 0.277 | 5/56 | 通過 | 通過 | 84.596% |
| near-7 | suneo 1 | 3.162 | 0.970 | 12/125 | 通過 | 未通過 | 75.894% |
| near-8 | grace 1 | 1.512 | 0.591 | 1/12 | 通過 | 通過 | 86.155% |
| near-8 | haru 1 | 2.513 | 0.277 | 5/56 | 通過 | 通過 | 68.225% |
| near-8 | suneo 1 | 3.193 | 0.970 | 12/125 | 通過 | 未通過 | 77.674% |

### 1792810580797-omit-unused-logits

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792810580797-omit-unused-logits/`。

設定：`[{"id":"no-logits-8","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":10}},{"id":"no-logits-6","threads":6,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":10}},{"id":"no-logits-4","threads":4,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":10}},{"id":"no-logits-8-plain","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":false,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":10}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| no-logits-4 | grace 1 | 1.520 | 0.591 | 1/12 | 通過 | 通過 | 55.706% |
| no-logits-4 | haru 1 | 2.991 | 0.277 | 5/56 | 通過 | 通過 | 50.349% |
| no-logits-4 | suneo 1 | 3.733 | 0.970 | 12/125 | 通過 | 未通過 | 48.812% |
| no-logits-6 | grace 1 | 1.388 | 0.591 | 1/12 | 通過 | 通過 | 67.047% |
| no-logits-6 | haru 1 | 2.662 | 0.277 | 5/56 | 通過 | 通過 | 62.466% |
| no-logits-6 | suneo 1 | 3.207 | 0.970 | 12/125 | 通過 | 未通過 | 57.349% |
| no-logits-8 | grace 1 | 1.353 | 0.591 | 1/12 | 通過 | 通過 | 72.864% |
| no-logits-8 | haru 1 | 2.403 | 0.277 | 5/56 | 通過 | 通過 | 69.283% |
| no-logits-8-plain | grace 1 | 1.406 | 0.591 | 1/12 | 通過 | 通過 | 81.326% |
| no-logits-8-plain | haru 1 | 2.559 | 0.277 | 5/56 | 通過 | 通過 | 79.003% |
| no-logits-8-plain | suneo 1 | 3.138 | 0.970 | 12/125 | 通過 | 未通過 | 81.729% |
| no-logits-8 | suneo 1 | 3.011 | 0.970 | 12/125 | 通過 | 未通過 | 68.117% |

### 1792810775155-sparse-mel-exact

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792810775155-sparse-mel-exact/`。

設定：`[{"id":"sparse-mel-profile","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":true,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":10}},{"id":"sparse-mel-plain","threads":8,"engine":{"guided":true,"alignmentOnly":true,"prepack":"group","batchSize":440,"attentionStride":4,"profile":false,"audioContext":960,"timeScale":3.25,"vectorActivations":true,"attentionQuant":2,"trimFinalContext":true,"attentionPositionPenalty":10}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| sparse-mel-plain | grace 1 | 1.272 | 0.591 | 1/12 | 通過 | 通過 | 70.473% |
| sparse-mel-plain | haru 1 | 2.331 | 0.277 | 5/56 | 通過 | 通過 | 70.519% |
| sparse-mel-plain | suneo 1 | 2.935 | 0.970 | 12/125 | 通過 | 通過 | 65.022% |
| sparse-mel-profile | grace 1 | 1.474 | 0.591 | 1/12 | 通過 | 通過 | 76.144% |
| sparse-mel-profile | haru 1 | 2.291 | 0.277 | 5/56 | 通過 | 通過 | 65.902% |
| sparse-mel-profile | suneo 1 | 2.858 | 0.970 | 12/125 | 通過 | 通過 | 64.830% |

### 1792811185385-production-final-acceptance

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792811185385-production-final-acceptance/`。

設定：`[{"id":"production","threads":8}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| production | grace 1 | 1.474 | 0.591 | 1/12 | 通過 | 通過 | 73.762% |
| production | grace 2 | 1.732 | 0.591 | 1/12 | 通過 | 通過 | 91.466% |
| production | grace 3 | 1.303 | 0.591 | 1/12 | 通過 | 通過 | 78.584% |
| production | haru 1 | 2.627 | 0.277 | 5/56 | 通過 | 通過 | 76.772% |
| production | haru 2 | 2.274 | 0.277 | 5/56 | 通過 | 通過 | 66.003% |
| production | haru 3 | 3.057 | 0.277 | 5/56 | 通過 | 未通過 | 87.889% |
| production | suneo 1 | 2.796 | 0.970 | 12/125 | 通過 | 通過 | 68.529% |
| production | suneo 2 | 2.954 | 0.970 | 12/125 | 通過 | 通過 | 65.617% |
| production | suneo 3 | 2.888 | 0.970 | 12/125 | 通過 | 通過 | 72.587% |

### 1792811626920-production-final-acceptance-compact-quant

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792811626920-production-final-acceptance-compact-quant/`。

設定：`[{"id":"production","threads":8}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| production | grace 1 | 1.420 | 0.591 | 1/12 | 通過 | 通過 | 73.067% |
| production | grace 2 | 1.448 | 0.591 | 1/12 | 通過 | 通過 | 73.472% |
| production | grace 3 | 1.245 | 0.591 | 1/12 | 通過 | 通過 | 73.635% |
| production | haru 1 | 2.445 | 0.277 | 5/56 | 通過 | 通過 | 72.953% |
| production | haru 2 | 2.393 | 0.277 | 5/56 | 通過 | 通過 | 74.429% |
| production | haru 3 | 2.398 | 0.277 | 5/56 | 通過 | 通過 | 73.198% |
| production | suneo 1 | 2.852 | 0.970 | 12/125 | 通過 | 通過 | 69.769% |
| production | suneo 2 | 3.396 | 0.970 | 12/125 | 通過 | 未通過 | 82.460% |
| production | suneo 3 | 3.012 | 0.970 | 12/125 | 通過 | 未通過 | 73.271% |

### 1792811859160-production-model-tile44

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792811859160-production-model-tile44/`。

設定：`[{"id":"production","threads":8}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| production | grace 1 | 1.535 | 0.591 | 1/12 | 通過 | 通過 | 83.180% |
| production | haru 1 | 2.364 | 0.277 | 5/56 | 通過 | 通過 | 77.069% |
| production | suneo 1 | 2.990 | 0.970 | 12/125 | 通過 | 通過 | 71.633% |

### 1792811881314-production-final-acceptance-tile44

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792811881314-production-final-acceptance-tile44/`。

設定：`[{"id":"production","threads":8}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| production | grace 1 | 1.244 | 0.591 | 1/12 | 通過 | 通過 | 71.839% |
| production | grace 2 | 1.451 | 0.591 | 1/12 | 通過 | 通過 | 75.636% |
| production | grace 3 | 1.398 | 0.591 | 1/12 | 通過 | 通過 | 93.044% |
| production | haru 1 | 2.258 | 0.277 | 5/56 | 通過 | 通過 | 72.247% |
| production | haru 2 | 2.574 | 0.277 | 5/56 | 通過 | 通過 | 84.003% |
| production | haru 3 | 2.404 | 0.277 | 5/56 | 通過 | 通過 | 80.789% |
| production | suneo 1 | 2.763 | 0.970 | 12/125 | 通過 | 通過 | 72.364% |
| production | suneo 2 | 3.003 | 0.970 | 12/125 | 通過 | 未通過 | 77.899% |
| production | suneo 3 | 3.455 | 0.970 | 12/125 | 通過 | 未通過 | 81.897% |

### 1792811937066-larger-physical-window-prior

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792811937066-larger-physical-window-prior/`。

設定：`[{"id":"c960-s350-p10","threads":8,"engine":{"audioContext":960,"timeScale":3.5,"attentionPositionPenalty":10,"profile":true}},{"id":"c960-s350-p20","threads":8,"engine":{"audioContext":960,"timeScale":3.5,"attentionPositionPenalty":20,"profile":true}},{"id":"c960-s375-p10","threads":8,"engine":{"audioContext":960,"timeScale":3.75,"attentionPositionPenalty":10,"profile":true}},{"id":"c960-s375-p20","threads":8,"engine":{"audioContext":960,"timeScale":3.75,"attentionPositionPenalty":20,"profile":true}},{"id":"c1024-s350-p10","threads":8,"engine":{"audioContext":1024,"timeScale":3.5,"attentionPositionPenalty":10,"profile":true}},{"id":"c928-s325-p10","threads":8,"engine":{"audioContext":928,"timeScale":3.25,"attentionPositionPenalty":10,"profile":true}}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| c1024-s350-p10 | grace 1 | 1.325 | 0.960 | 1/12 | 通過 | 通過 | 79.468% |
| c1024-s350-p10 | haru 1 | 2.693 | 0.843 | 5/56 | 通過 | 通過 | 87.999% |
| c1024-s350-p10 | suneo 1 | 2.796 | 7.099 | 12/125 | 失敗 | 未通過 | 73.350% |
| c928-s325-p10 | grace 1 | 1.494 | 0.743 | 1/12 | 通過 | 通過 | 88.620% |
| c928-s325-p10 | haru 1 | 2.322 | 0.342 | 5/56 | 通過 | 通過 | 80.761% |
| c928-s325-p10 | suneo 1 | 2.868 | 26.548 | 12/125 | 失敗 | 未通過 | 79.425% |
| c960-s350-p10 | grace 1 | 1.233 | 0.645 | 1/12 | 通過 | 通過 | 75.138% |
| c960-s350-p10 | haru 1 | 2.247 | 0.428 | 5/56 | 通過 | 通過 | 72.797% |
| c960-s350-p10 | suneo 1 | 2.693 | 10.497 | 12/125 | 失敗 | 未通過 | 72.617% |
| c960-s350-p20 | grace 1 | 1.231 | 0.671 | 1/12 | 通過 | 通過 | 76.313% |
| c960-s350-p20 | haru 1 | 2.159 | 0.423 | 5/56 | 通過 | 通過 | 71.397% |
| c960-s350-p20 | suneo 1 | 2.706 | 7.845 | 12/125 | 失敗 | 未通過 | 69.882% |
| c960-s375-p10 | grace 1 | 1.117 | 0.945 | 1/12 | 通過 | 通過 | 72.269% |
| c960-s375-p10 | haru 1 | 2.145 | 1.063 | 5/56 | 失敗 | 未通過 | 75.329% |
| c960-s375-p10 | suneo 1 | 3.004 | 13.118 | 12/125 | 失敗 | 未通過 | 78.065% |
| c960-s375-p20 | grace 1 | 1.155 | 0.945 | 1/12 | 通過 | 通過 | 74.870% |
| c960-s375-p20 | haru 1 | 2.216 | 0.988 | 5/56 | 通過 | 通過 | 75.445% |
| c960-s375-p20 | suneo 1 | 2.756 | 7.505 | 12/125 | 失敗 | 未通過 | 74.363% |

### 1792811994903-tile44-thread-retune

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792811994903-tile44-thread-retune/`。

設定：`[{"id":"threads12","threads":12},{"id":"threads6","threads":6},{"id":"threads8","threads":8}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| threads12 | grace 1 | 3.813 | 0.591 | 1/12 | 通過 | 未通過 | 96.600% |
| threads12 | haru 1 | 3.538 | 0.277 | 5/56 | 通過 | 未通過 | 91.826% |
| threads12 | suneo 1 | 4.757 | 0.970 | 12/125 | 通過 | 未通過 | 92.792% |
| threads6 | grace 1 | 1.234 | 0.591 | 1/12 | 通過 | 通過 | 60.060% |
| threads6 | haru 1 | 2.399 | 0.277 | 5/56 | 通過 | 通過 | 58.125% |
| threads6 | suneo 1 | 2.992 | 0.970 | 12/125 | 通過 | 通過 | 60.987% |
| threads8 | grace 1 | 1.258 | 0.591 | 1/12 | 通過 | 通過 | 78.271% |
| threads8 | haru 1 | 2.297 | 0.277 | 5/56 | 通過 | 通過 | 73.484% |
| threads8 | suneo 1 | 2.860 | 0.970 | 12/125 | 通過 | 通過 | 72.957% |

### 1792812212761-attention-and-model-tile44

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792812212761-attention-and-model-tile44/`。

設定：`[{"id":"production","threads":8}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| production | grace 1 | 1.476 | 0.591 | 1/12 | 通過 | 通過 | 80.819% |
| production | haru 1 | 2.292 | 0.277 | 5/56 | 通過 | 通過 | 78.100% |
| production | suneo 1 | 2.873 | 0.970 | 12/125 | 通過 | 通過 | 80.478% |

### 1792812241771-production-final-acceptance-full-tile44

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792812241771-production-final-acceptance-full-tile44/`。

設定：`[{"id":"production","threads":8}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| production | grace 1 | 1.250 | 0.591 | 1/12 | 通過 | 通過 | 77.473% |
| production | grace 2 | 1.475 | 0.591 | 1/12 | 通過 | 通過 | 76.144% |
| production | grace 3 | 1.477 | 0.591 | 1/12 | 通過 | 通過 | 91.154% |
| production | haru 1 | 2.369 | 0.277 | 5/56 | 通過 | 通過 | 76.734% |
| production | haru 2 | 2.200 | 0.277 | 5/56 | 通過 | 通過 | 68.308% |
| production | haru 3 | 2.230 | 0.277 | 5/56 | 通過 | 通過 | 74.393% |
| production | suneo 1 | 2.771 | 0.970 | 12/125 | 通過 | 通過 | 72.860% |
| production | suneo 2 | 2.711 | 0.970 | 12/125 | 通過 | 通過 | 66.456% |
| production | suneo 3 | 2.719 | 0.970 | 12/125 | 通過 | 通過 | 67.900% |

### 1792837560091-production-candidates-three-song

原始結果、設定、來源雜湊與負載採樣：`.local/three-second/1792837560091-production-candidates-three-song/`。

設定：`[{"id":"production","threads":8}]`。

| 設定 | 歌曲／次數 | operation 秒 | 句首 MAE 秒 | 排除／總句數 | 品質 | 完整驗收 | 系統 CPU 平均忙碌比例 |
|---|---|---:|---:|---:|---|---|---:|
| production | bugs 1 | 3.327 | 2.843 | 8/88 | 失敗 | 未通過 | 87.696% |
| production | bugs 2 | 2.657 | 2.843 | 8/88 | 失敗 | 未通過 | 77.304% |
| production | bugs 3 | 2.513 | 2.843 | 8/88 | 失敗 | 未通過 | 72.666% |
| production | green 1 | 2.250 | 0.685 | 3/38 | 通過 | 通過 | 85.574% |
| production | green 2 | 2.283 | 0.685 | 3/38 | 通過 | 通過 | 74.222% |
| production | green 3 | 2.263 | 0.685 | 3/38 | 通過 | 通過 | 76.887% |
| production | lift 1 | 1.488 | 1.083 | 1/19 | 失敗 | 未通過 | 74.686% |
| production | lift 2 | 1.744 | 1.083 | 1/19 | 失敗 | 未通過 | 75.266% |
| production | lift 3 | 1.610 | 1.083 | 1/19 | 失敗 | 未通過 | 80.082% |
