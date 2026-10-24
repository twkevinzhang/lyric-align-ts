# 1.0.1 發佈計畫

使用者已停止持續優化，接受目前結果，並授權排除 TEN-VAD、接受準確率變動後發佈 1.0.1。此授權取代先前不提交、不發佈與僅測開發組的限制。

- [x] 正式 Worker 採已接受的非 VAD 對齊配置。
- [x] 排除 TEN-VAD 載入與發佈資產。
- [x] 套件與 capabilities.libraryVersion 同步 1.0.1。
- [x] 六首用正式預設各測一次，記錄全部句首句尾誤差與完整耗時；不調參、不聲稱達到原門檻。
- [x] 通過型別、單元、真實瀏覽器、session 與 tarball consumer 檢查。
- [x] 完成發佈審查與乾淨版本原生重建，產物與六首測試資產逐位元一致。
發佈完成條件：npm registry 的 1.0.1 與 latest 指向一致，遠端 tarball 與本機驗證包逐位元一致。

實測與限制見 docs/three-second-alignment-report.md；正式說明見 docs/release-1.0.1.md。
