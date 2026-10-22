# Library binding implementation plan

**Goal:** 實現 yt-subtitle contract v1 的瀏覽器 binding，沿用固定 small.en/q4 核心。
**Architecture:** 公開 binding 管理每個 session 的專用 module Worker；Worker 執行既有模型準備、全曲 ASR 與對齊。取消終止專用 Worker，拒絕未完成操作；dispose 等待操作終態且可重複執行。
**Spec:** `C:/Projects/yt-subtitle/docs/superpowers/specs/lyric-align-contract.ts` 與相鄰整合設計。

## Constraints and review focus
- 只改 lyric-align-ts；英文、固定模型、預設 WebGPU，不提供歌詞提示或 fallback。
- 保留每行逐字原文；不插補。所有時間為秒。
- 驗證非法 PCM、options、生命週期、取消與錯誤；無實測 total 時不提供百分比。
- 對齊核心預設保持上游一致，新增明確 threshold/window 參數。
- unit tests 不能替代真實瀏覽器全曲驗收；未實測項目明確標示。

## Tasks
- [x] 契約與 session 核心：先測試原文、選項、輸入、進度與生命週期，再實作。
- [x] Worker transport：先測試取消、並行拒絕、重複 dispose、錯誤，再接真實核心。
- [x] 公開 browser 入口與可打包發布物，核對消費端契約型別。
- [x] 執行完整 tests、lint、typecheck、build；使用本機全曲素材驗證正式 binding，更新 README。

執行授權：使用者本次明確要求依既有完整契約與設計實作。由目前 agent 原地執行；不提交或部署。此文件僅保留目前待辦與真實驗證狀態。

## Current verification

- 57 項測試、TypeScript、ESLint、原應用 build 與 library build 已通過。
- 獨立審查發現零長度 ASR 詞被誤拒，已加入失敗重現並修正；段落仍要求正長度。
- 產出 `spike/dist/library` 與 `spike/dist/lyric-align-ts-0.1.0.zip`；發布物型別已實際與 yt-subtitle 原始契約賦值檢查通過，且 44100 Hz 會被型別拒絕。
- 最終正式打包入口已在 Chrome WebGPU 跑完整 130.29875 秒音訊，6 ASR 段、12/12 行合法匹配、原文／順序保持、重複 dispose 完成，推論 151.15 秒。進度事件 phase-local sequence 與真實 bytes/items 已核對；證據為 `.local/results/binding-{report,validation}.json`。
- 未修改 yt-subtitle；extension offscreen/CSP 與獨立音訊提供者仍屬消費端整合驗收，不能宣稱已完成。
- 已載入真實模型後的全曲推論取消回報 ABORTED、重複 dispose 成功；證據 `.local/results/binding-cancel-report.json`。
