# 十秒與三秒實作的切換契約

支援切換的是保留 session contract v1 的 `codex/yt-subtitle-ten-second` 與 `codex/yt-subtitle-three-second`。原始 `741458c`、`cpp` 的 `a22e68e` 沒有 session API，不能直接當成 yt-subtitle 的相容切換點。

| 切換點 | 實作來源 | 完整單元／來源測試 | 歌詞引導效能驗收 |
|---|---|---:|---|
| codex/yt-subtitle-ten-second | 2f55135 | 72/72 | 9/9 ≤10 秒，最慢 9.491210 秒 |
| codex/yt-subtitle-three-second | 06e4fae 合併 cpp，後續僅更新文件 | 83/83 | 8/9 ≤3 秒，最慢 3.149730 秒 |

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

十秒切換點實際從三秒版切回、還原原生來源並重新編譯後，三首各三次 9/9 通過；證據 `.local/three-second/1792842438427-roundtrip-baseline-ten-second/`。三秒切換點為 8/9，SUNEO-ISM 第一次引擎推論 3.034900 秒、operation 3.149730 秒超時；其餘八次及全部句首品質通過，不能宣稱穩定三秒。

實際完成三秒→十秒→三秒切換。兩個方向均先確認錯版原生資產被拒絕，再使用相符 source／binary proof 的資產重建 JS；十秒版原生資產重新編譯，返回三秒時使用先前已驗證且逐位相同的三秒原生快取。兩版均通過相同外部 TypeScript 契約、真實套件安裝／推論及 yt-subtitle 原始 loader／runner／validator；speech 完整、silence incomplete。三秒版另有跨歌曲重用與 fresh 結果相同、取消／釋放後零 Workers 的驗證。

session 全曲實測仍未通過：十秒版 4/12、6/133、3/56 行，三秒版 4/12、8/133、3/56 行。兩版都維持整首拒絕規則，沒有用 ASR 文字覆蓋原文或降低完整驗證門檻。完整原始輸出與套件分別保存於 `.local/compatibility/ten-second/`、`.local/compatibility/three-second/`；換行相依的來源測試已修正為 canonical LF，未跳過該測試。

觀察事實：公開契約／binding／型別／入口／模型與套件設定無差異，兩版真實接線及來回切換測試通過。結論：保證範圍為上述指定版本、相符產物及已驗證公開契約；不宣稱每次三秒或完整無時間碼歌曲可用。可靠度分數：98%。驗證方式：切換後重跑本頁命令；跨硬體與 MV3 產品流程需另驗收。

三秒版本的最新逐次數據與計時口徑見 [效能報告](three-second-alignment-report.md)。session 全曲限制見 [session 契約](session-contract.md)。測試、真實模型接線及實際切換結果以交付時的對話與忽略的 `.local/` 原始輸出為準，不保存過期實驗流程文件。
