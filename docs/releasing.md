# 發布前檢查

目前是實驗性 browser package；準備或 pack 不等於授權發布。只有使用者明確要求才執行 npm publish／推送 Git。

1. 從乾淨 checkout 依 development.md 完整建置固定 C++／WASM，包含 mel／matrix 測試。
2. 執行 pnpm run typecheck、pnpm test、pnpm run test:browser、pnpm run test:package。
3. 檢查 .local/package/package-check.json 的 tarball 檔案清單與 consumer 測試結果。只允許 dist/、README、package.json、LICENSE、THIRD_PARTY_NOTICES。
4. 不得包含模型權重、歌曲、參考字幕、.local/、node_modules/、使用者絕對路徑、原生工具或秘密資訊。
5. 確認套件名稱／版本、README API、靜態資產部署與 COOP／COEP 說明、MIT／第三方 notices、已知時間軸限制皆符合實際狀態。
6. 發布前在目標網站配置資產 URL；跨網域需正確 CORS/CORP。實測指定瀏覽器，不能從單一本機 Chrome 推定所有 browser runtime 皆支援。

```sh
pnpm pack --pack-destination .local/package
```

產物可用 npm install ./lyric-align-ts-1.0.0.tgz 安裝。模型由模型 URL 另行取得，預設使用固定 tiny Q5_1 與 SHA256。prepack 只檢查已建置產物，不會在消費者安裝時執行原生編譯。

尚未修正的句首提前、句尾偏差與零長度時間軸都必須保留在發布說明。SRT exporter 省略無效／零長度句，完整診斷仍在 result.cues[].issues；這是匯出格式防護，不是時間估計已修正。
