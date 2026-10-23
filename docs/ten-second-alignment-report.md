# 三曲 10 秒改善實測

更新：2026-10-23T20:07:55.164Z。已完成三曲各三次正式驗收，九次全部通過。下表每列為一次實際完整 Chrome CPU/WASM 推論，非穩定性保證。

每首 ≤10 秒（含初始化、對齊、RPC；不含音檔解碼、模型傳入與編譯）。最多排除 floor(N×10%) 句，缺漏先占額度；保留句首 MAE ≤1 秒。句尾不影響驗收。參考時間未用於推論。

## 固定候選正式驗收

獨立重評分時間：2026-10-23T20:07:53.234Z。設定指紋：`0019f17cb371f5571c95cc24638f11a83740d59d2d3d4e5e4939b219ab6470c9`。九次使用相同推論程式、WASM、模型與參數；各曲輸入雜湊一致，生命週期檢查通過。

| 輪次 | 歌曲 | 耗時秒 | 保留句首 MAE 秒 | 排除句號 | 通過 |
|---|---|---:|---:|---|---|
| validation-1 | grace | 3.735 | 0.460 | 1 | 通過 |
| validation-1 | suneo | 9.357 | 0.193 | 121, 43, 1, 101, 42, 102, 63, 9, 34, 6, 114, 73 | 通過 |
| validation-1 | haru | 8.486 | 0.429 | 1, 37, 16, 53, 55 | 通過 |
| validation-2 | grace | 3.892 | 0.460 | 1 | 通過 |
| validation-2 | suneo | 9.602 | 0.193 | 121, 43, 1, 101, 42, 102, 63, 9, 34, 6, 114, 73 | 通過 |
| validation-2 | haru | 7.672 | 0.429 | 1, 37, 16, 53, 55 | 通過 |
| validation-3 | grace | 4.234 | 0.460 | 1 | 通過 |
| validation-3 | suneo | 9.483 | 0.193 | 121, 43, 1, 101, 42, 102, 63, 9, 34, 6, 114, 73 | 通過 |
| validation-3 | haru | 7.453 | 0.429 | 1, 37, 16, 53, 55 | 通過 |

## 改善實驗實測

| 實驗 | 歌曲 | 模型 | 秒 | encoder 秒 | decoder 秒 | 配對 | 排除數 | 保留 MAE 秒 | 品質 | 通過 |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|
| baseline | grace | small | 36.714 | 29.752 | 2.478 | 12/12 | 1 | 0.618 | 通過 | 失敗 |
| baseline | suneo | small | 154.213 | 57.649 | 43.229 | 100/125 | 12 | 無效 | 失敗 | 失敗 |
| baseline | haru | small | 115.065 | 62.514 | 24.264 | 56/56 | 5 | 76.935 | 失敗 | 失敗 |
| tiny | grace | tiny | 8.962 | 4.688 | 0.579 | 12/12 | 1 | 0.609 | 通過 | 通過 |
| tiny | suneo | tiny | 68.460 | 8.592 | 11.203 | 125/125 | 12 | 0.198 | 通過 | 失敗 |
| tiny | haru | tiny | 44.652 | 8.735 | 7.040 | 56/56 | 5 | 83.719 | 失敗 | 失敗 |
| tiny-contiguous | grace | tiny | 9.011 | 4.494 | 0.661 | 12/12 | 1 | 0.602 | 通過 | 通過 |
| tiny-contiguous | suneo | tiny | 67.141 | 8.613 | 10.610 | 125/125 | 12 | 0.168 | 通過 | 失敗 |
| tiny-contiguous | haru | tiny | 28.259 | 7.335 | 4.296 | 56/56 | 5 | 91.182 | 失敗 | 失敗 |
| worker-tiny | grace | tiny | 5.785 | 4.196 | 0.671 | 12/12 | 1 | 0.602 | 通過 | 通過 |
| worker-tiny | suneo | tiny | 28.788 | 8.641 | 12.451 | 125/125 | 12 | 0.168 | 通過 | 失敗 |
| worker-tiny | haru | tiny | 15.108 | 7.528 | 4.100 | 56/56 | 5 | 91.182 | 失敗 | 失敗 |
| worker-eot10 | grace | tiny | 6.032 | 4.421 | 0.668 | 12/12 | 1 | 0.531 | 通過 | 通過 |
| worker-eot10 | suneo | tiny | 27.289 | 8.620 | 11.145 | 125/125 | 12 | 0.190 | 通過 | 失敗 |
| worker-eot10 | haru | tiny | 16.033 | 8.351 | 4.116 | 56/56 | 5 | 85.307 | 失敗 | 失敗 |
| worker-two | grace | tiny | 10.983 | 8.736 | 1.160 | 12/12 | 1 | 0.602 | 通過 | 失敗 |
| worker-two | suneo | tiny | 51.010 | 18.881 | 23.904 | 125/125 | 12 | 0.168 | 通過 | 失敗 |
| worker-two | haru | tiny | 25.903 | 15.157 | 7.008 | 56/56 | 5 | 91.182 | 失敗 | 失敗 |
| worker-base | grace | base | 10.310 | 8.192 | 1.063 | 12/12 | 1 | 0.755 | 通過 | 失敗 |
| worker-base | suneo | base | 43.958 | 16.578 | 17.363 | 125/125 | 12 | 0.182 | 通過 | 失敗 |
| worker-base | haru | base | 26.051 | 15.353 | 6.234 | 56/56 | 5 | 49.300 | 失敗 | 失敗 |
| free-tiny | haru | tiny | 35.371 | 6.868 | 13.686 | 2/56 | 5 | 無效 | 失敗 | 失敗 |
| scale-two | grace | tiny | 4.227 | 2.595 | 0.527 | 12/12 | 1 | 0.680 | 通過 | 通過 |
| scale-two | suneo | tiny | 20.853 | 5.433 | 9.229 | 95/125 | 12 | 無效 | 失敗 | 失敗 |
| scale-two | haru | tiny | 13.906 | 4.715 | 5.135 | 56/56 | 5 | 3.308 | 失敗 | 失敗 |
| scale-three | grace | tiny | 3.598 | 2.007 | 0.564 | 12/12 | 1 | 0.795 | 通過 | 通過 |
| scale-three | suneo | tiny | 14.608 | 3.854 | 6.247 | 68/125 | 12 | 無效 | 失敗 | 失敗 |
| scale-three | haru | tiny | 13.315 | 3.956 | 5.478 | 56/56 | 5 | 2.685 | 失敗 | 失敗 |
| scale-two-440 | suneo | tiny | 29.340 | 5.095 | 16.264 | 124/125 | 12 | 0.910 | 通過 | 失敗 |
| scale-two-440 | haru | tiny | 13.707 | 4.586 | 5.073 | 56/56 | 5 | 3.308 | 失敗 | 失敗 |
| speculative-eight | grace | tiny | 7.064 | 4.473 | 1.061 | 12/12 | 1 | 0.607 | 通過 | 通過 |
| speculative-eight | suneo | tiny | 31.910 | 9.220 | 13.137 | 125/125 | 12 | 0.165 | 通過 | 失敗 |
| speculative-eight | haru | tiny | 15.847 | 7.492 | 3.825 | 56/56 | 5 | 91.182 | 失敗 | 失敗 |
| scale-two-eot10 | haru | tiny | 13.526 | 4.772 | 4.454 | 56/56 | 5 | 0.316 | 通過 | 失敗 |
| f16-scale-two-eot10 | grace | tiny | 4.851 | 2.690 | 1.053 | 12/12 | 1 | 0.827 | 通過 | 通過 |
| f16-scale-two-eot10 | suneo | tiny | 39.292 | 5.192 | 26.090 | 125/125 | 12 | 0.184 | 通過 | 失敗 |
| f16-scale-two-eot10 | haru | tiny | 16.395 | 4.576 | 7.972 | 56/56 | 5 | 0.316 | 通過 | 失敗 |
| speculative-sixtyfour-scale-two | suneo | tiny | 28.829 | 5.665 | 14.695 | 124/125 | 12 | 0.385 | 通過 | 失敗 |
| speculative-sixtyfour-scale-two | haru | tiny | 16.654 | 4.303 | 8.541 | 56/56 | 5 | 0.330 | 通過 | 失敗 |
| subset-scale-two | grace | tiny | 4.375 | 2.567 | 0.652 | 12/12 | 1 | 0.744 | 通過 | 通過 |
| subset-scale-two | suneo | tiny | 20.103 | 7.897 | 7.059 | 67/125 | 12 | 無效 | 失敗 | 失敗 |
| subset-scale-two | haru | tiny | 13.593 | 5.966 | 3.405 | 56/56 | 5 | 0.774 | 通過 | 失敗 |
| worker-dtw-scale-two | grace | tiny | 4.072 | 2.563 | 0.629 | 12/12 | 1 | 0.751 | 通過 | 通過 |
| worker-dtw-scale-two | suneo | tiny | 24.031 | 5.011 | 17.089 | 124/125 | 12 | 0.910 | 通過 | 失敗 |
| worker-dtw-scale-two | haru | tiny | 10.295 | 4.271 | 4.384 | 56/56 | 5 | 0.316 | 通過 | 失敗 |
| natural-scale-two | suneo | tiny | 15.962 | 4.520 | 9.729 | 125/125 | 12 | 0.729 | 通過 | 失敗 |
| natural-scale-two | haru | tiny | 9.037 | 4.223 | 3.257 | 56/56 | 5 | 3.437 | 失敗 | 失敗 |
| natural-units-twelve | suneo | tiny | 93.188 | 6.242 | 85.051 | 125/125 | 12 | 0.208 | 通過 | 失敗 |
| natural-units-six | suneo | tiny | 16.192 | 4.862 | 9.638 | 125/125 | 12 | 0.208 | 通過 | 失敗 |
| natural-units-six | haru | tiny | 10.037 | 4.960 | 3.441 | 56/56 | 5 | 2.776 | 失敗 | 失敗 |
| natural-subset-eot90 | grace | tiny | 4.075 | 2.641 | 0.573 | 12/12 | 1 | 0.773 | 通過 | 通過 |
| natural-subset-eot90 | suneo | tiny | 12.103 | 4.272 | 6.257 | 59/125 | 12 | 無效 | 失敗 | 失敗 |
| natural-subset-eot90 | haru | tiny | 8.675 | 4.241 | 2.767 | 56/56 | 5 | 0.322 | 通過 | 通過 |
| natural-subset-scale-three-eot9999 | grace | tiny | 3.265 | 1.937 | 0.557 | 12/12 | 1 | 0.845 | 通過 | 通過 |
| natural-subset-scale-three-eot9999 | suneo | tiny | 11.972 | 3.163 | 7.288 | 84/125 | 12 | 無效 | 失敗 | 失敗 |
| natural-subset-scale-three-eot9999 | haru | tiny | 10.141 | 3.741 | 4.876 | 53/56 | 5 | 39.087 | 失敗 | 失敗 |
| cached-natural | suneo | tiny | 18.314 | 4.329 | 12.297 | 125/125 | 12 | 0.199 | 通過 | 失敗 |
| cached-dot-clean | suneo | tiny | 17.604 | 4.288 | 11.718 | 125/125 | 12 | 0.172 | 通過 | 失敗 |
| context-750-natural-v2 | grace | tiny | 3.596 | 1.928 | 0.637 | 12/12 | 1 | 4.967 | 失敗 | 失敗 |
| context-750-natural-v2 | suneo | tiny | 15.752 | 3.366 | 10.055 | 125/125 | 12 | 72.714 | 失敗 | 失敗 |
| context-750-natural-v2 | haru | tiny | 8.086 | 2.769 | 3.496 | 56/56 | 5 | 63.886 | 失敗 | 失敗 |
| no-timestamps-batch64 | grace | tiny | 3.622 | 2.456 | 0.348 | 12/12 | 1 | 0.707 | 通過 | 通過 |
| no-timestamps-batch64 | suneo | tiny | 9.265 | 3.619 | 4.087 | 125/125 | 12 | 24.988 | 失敗 | 失敗 |
| no-timestamps-batch64 | haru | tiny | 6.684 | 3.685 | 1.477 | 56/56 | 5 | 76.845 | 失敗 | 失敗 |
| attention-overlap | grace | tiny | 4.129 | 2.623 | 0.587 | 12/12 | 1 | 0.464 | 通過 | 通過 |
| attention-overlap | suneo | tiny | 13.515 | 4.673 | 7.133 | 125/125 | 12 | 0.193 | 通過 | 失敗 |
| attention-overlap | haru | tiny | 9.088 | 4.664 | 2.656 | 56/56 | 5 | 0.413 | 通過 | 通過 |
| attention-subset | grace | tiny | 4.604 | 3.234 | 0.448 | 12/12 | 1 | 0.460 | 通過 | 通過 |
| attention-subset | suneo | tiny | 11.796 | 4.715 | 5.357 | 125/125 | 12 | 0.193 | 通過 | 失敗 |
| attention-subset | haru | tiny | 8.467 | 4.777 | 2.032 | 56/56 | 5 | 0.420 | 通過 | 通過 |
| attention-subset-scale-three | grace | tiny | 3.200 | 2.083 | 0.330 | 12/12 | 1 | 0.785 | 通過 | 通過 |
| attention-subset-scale-three | suneo | tiny | 9.351 | 3.688 | 4.154 | 56/125 | 12 | 無效 | 失敗 | 失敗 |
| attention-subset-scale-three | haru | tiny | 6.779 | 3.266 | 1.961 | 56/56 | 5 | 0.552 | 通過 | 通過 |
| attention-subset-batch128 | grace | tiny | 3.644 | 2.437 | 0.390 | 12/12 | 1 | 0.460 | 通過 | 通過 |
| attention-subset-batch128 | suneo | tiny | 10.601 | 4.236 | 4.728 | 125/125 | 12 | 0.193 | 通過 | 失敗 |
| attention-subset-batch128 | haru | tiny | 7.714 | 4.233 | 1.935 | 56/56 | 5 | 0.420 | 通過 | 通過 |
| attention-lookahead115 | grace | tiny | 3.711 | 2.497 | 0.387 | 12/12 | 1 | 0.460 | 通過 | 通過 |
| attention-lookahead115 | suneo | tiny | 9.632 | 4.289 | 3.685 | 125/125 | 12 | 0.193 | 通過 | 通過 |
| attention-lookahead115 | haru | tiny | 7.286 | 4.212 | 1.431 | 56/56 | 5 | 0.429 | 通過 | 通過 |
| candidate-budget-bound | grace | tiny | 5.021 | 3.285 | 0.773 | 12/12 | 1 | 0.460 | 通過 | 通過 |
| candidate-budget-bound | suneo | tiny | 9.656 | 4.404 | 3.610 | 125/125 | 12 | 0.193 | 通過 | 通過 |
| candidate-budget-bound | haru | tiny | 7.385 | 4.332 | 1.436 | 56/56 | 5 | 0.429 | 通過 | 通過 |
| validation-1 | grace | tiny | 3.735 | 2.501 | 0.410 | 12/12 | 1 | 0.460 | 通過 | 通過 |
| validation-1 | suneo | tiny | 9.357 | 4.248 | 3.522 | 125/125 | 12 | 0.193 | 通過 | 通過 |
| validation-1 | haru | tiny | 8.486 | 5.101 | 1.597 | 56/56 | 5 | 0.429 | 通過 | 通過 |
| validation-2 | grace | tiny | 3.892 | 2.574 | 0.432 | 12/12 | 1 | 0.460 | 通過 | 通過 |
| validation-2 | suneo | tiny | 9.602 | 4.354 | 3.577 | 125/125 | 12 | 0.193 | 通過 | 通過 |
| validation-2 | haru | tiny | 7.672 | 4.623 | 1.423 | 56/56 | 5 | 0.429 | 通過 | 通過 |
| validation-3 | grace | tiny | 4.234 | 2.980 | 0.414 | 12/12 | 1 | 0.460 | 通過 | 通過 |
| validation-3 | suneo | tiny | 9.483 | 4.241 | 3.624 | 125/125 | 12 | 0.193 | 通過 | 通過 |
| validation-3 | haru | tiny | 7.453 | 4.431 | 1.427 | 56/56 | 5 | 0.429 | 通過 | 通過 |

RPC 時間涵蓋模型計算，不能與 encoder/decoder 相加。Worker 模式的 decoder 秒包含整段解碼控制與序列化；Node 模式只有各次模型呼叫，兩者不能直接當作純模型加速比。初始化、參數、原始碼與模型雜湊、呼叫數及排除句明細見本機 JSON/CSV。原始資料：`.local/whisper-poc/speed-<實驗>-<歌曲>/`，每組包含 wasm.json、evaluation.json、cues.csv、生命週期及日誌。

## 最終決策、證據與後續方向

- 採用 `fast.mjs` 的單一 `ten-second` 設定：tiny Q5_1、8 計算執行緒、helper 池 12、2 倍 mel 時間壓縮、1500-frame context、Worker 解碼與 DTW、自然日文分詞、128-token 推測批次、440-token 上限、詞彙子集、停用 timestamp 解碼、注意力尾段延後、lookahead 1.15。三曲無特製分支。
- 不裁切原音訊；時間壓縮以完整 PCM 的 mel 相鄰格平均實作，輸出換回原時間。SRT 只提供歌詞文字，正確答案時間僅在運算結束後評分。
- 單獨停用 timestamp 解碼雖快，但未唱到的文字會被 DTW 擠到視窗尾端。採用注意力路徑的 25 秒虛擬時間分界與 5 秒重疊，將尾段文字留到下一視窗；分界由音訊／注意力決定。此變更讓三曲品質通過。
- Worker 解碼減少逐 token RPC；Worker DTW 另減少大型 QK 搬運。在固定舊參數下，haru 的 Worker DTW 與 Node 完整時間軸一致，13.526 秒降到 10.295 秒。最終其他參數也有改變，不宣稱最終結果與原模型逐值相同。
- 將批次擴到 128 並依音訊／歌詞總長限制 lookahead，減少未使用的未來 token 計算。剩餘解碼預算也限制批次長度，避免最後一批浪費。固定候選經三輪全曲驗收，九次均通過。
- 未採用方向：12 threads 明顯變慢；tiny F16 未改善長曲速度；固定權重解包快取為 17.604 秒（suneo），無加速；750-frame context 三曲品質失敗；3 倍時間壓縮使 suneo 缺漏超額。快取預設停用。不同參數的最佳數字沒有混為同一候選。
- 已修正評分漏洞：父 word 內含 confidence=0 子 token 亦列為無效；句尾不列入通過條件。37 項 song 測試通過；WASM 矩陣／mel 測試通過，F16 最大誤差 0.000366210938，在固定 0.001 界內。頂層 native snapshot 整合測試缺少既有 latest-native.txt，未宣稱全 repository 測試全過。
- 獨立審查指出的缺漏子 token 與 browser.close 失敗清理問題均已修正。重跑會先清除上一輪結果；正式驗證器核對實驗生命週期、不同 runId、來源／build／輸入雜湊，並獨立重評分。沒有參考時間洩漏或歌曲 ID 校正。
- 所有正式量測均獨立啟動 Chrome，按順序執行，未與建置或測試重疊。全部自建服務已停止；未關閉使用者其他程式。
- 結論：指定三曲與目前本機環境已達驗收。可靠度分數：95%。支持證據為九次完整實測與獨立重評分；更多背景負載或其他硬體可能降低速度可靠度。驗證方式為相同入口再做三輪並執行 validate-candidate.mjs。
- 下一步僅在擴大範圍時進行：新增未見歌曲與不同 CPU 的驗收集，特別觀察 suneo 最慢 9.602 秒的剩餘餘裕；不以修改現有驗收門檻換取通過。

排除無效量測（不列入速度或品質結論）：
- speed-cached-dot-natural-suneo: Started while test binary was still linking; exclude timing from comparison
