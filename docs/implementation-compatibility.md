# 十秒與三秒實作的切換契約

支援切換的是保留 session contract v1 的 `codex/yt-subtitle-ten-second` 與 `codex/yt-subtitle-three-second`。原始 `741458c`、`cpp` 的 `a22e68e` 沒有 session API，不能直接當成 yt-subtitle 的相容切換點。

兩版的 src/contract.ts、src/binding.ts、src/types.ts、src/index.ts、src/model.ts、package.json 與 lockfile 保持一致；固定相同 tiny Q5_1、語言能力、session API、選項、秒數、取消／錯誤與原文保留契約。三秒版只改內部歌詞引導引擎與相關原生 ABI，不把自由 ASR 改成強制歌詞解碼。

十秒／三秒指已知歌詞的 createAligner 路徑及對應效能驗收門檻，不表示每次實測必定達標，也不表示 session 自由 ASR 全曲能在三秒內完成。session 全曲驗收仍要求所有必要行匹配，不能套用歌詞引導測試的10%排除額度。

## 切換流程

```sh
git switch codex/yt-subtitle-ten-second
# 或 git switch codex/yt-subtitle-three-second
pnpm install --frozen-lockfile
pnpm run build:native
pnpm run build
pnpm run typecheck
pnpm test
pnpm run test:contract
pnpm run test:package
node scripts/test-consumer-contract.mjs C:/Projects/yt-subtitle
```

Git 不管理 dist/、模型與原生快取。source/build proof 拒絕另一版的 WASM 或混用 dist；native build 清除自身 CMakeCache，從固定上游 commit 還原受追蹤依賴來源後，再生成本版 patch。還原限於 .local/native 下依賴 repository，保留未追蹤檔案。不要直接沿用切換前的 dist。

自由 ASR 進入時關閉 alignment-only、attention quantization、vector activations，使用 timeScale=1 與完整 1500-frame context；完成／失敗都還原本版設定，含三秒版 3.25 倍時間尺度。模型 group 預打包仍保留，因此不承諾兩版 ASR 浮點輸出／時間逐位相等；需通過同一組真實模型與消費端驗證。

相容性保證限於上述明確版本、固定依賴與相符建置產物的公開契約及已執行測試。任意歷史 commit、手動修改 generated sources、其他硬體及完整 extension/MV3 產品流程不由這項驗證推定。

## 驗證資料

目前基準十秒測量：`.local/three-second/1792840222247-contract-baseline-ten-second/`。九次中八次通過，一次 SUNEO-ISM 12.616740 秒超時；各次句首品質通過，不能宣稱九次全過。

三秒版本的最新逐次數據與計時口徑見 [效能報告](three-second-alignment-report.md)。session 全曲限制見 [session 契約](session-contract.md)。測試、真實模型接線及實際切換結果以交付時的對話與忽略的 `.local/` 原始輸出為準，不保存過期實驗流程文件。
