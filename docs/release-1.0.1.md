# lyric-align-ts 1.0.1

已知歌詞對齊預設改為 1.5 倍壓縮、640 context、四區塊注意力與 token／停頓單調分配，並使用後驗句尾估計。矩陣工作分配減少相鄰輸出的執行緒競爭。獨立 ASR 仍使用完整 encoder 注意力，並在結束或失敗後恢復設定。套件與 capabilities.libraryVersion 同步為 1.0.1。

本版排除 TEN-VAD。句尾與先前研究版不同，沒有宣稱純 MIT 套件包含該元件。六首正式預設測試僅兩首達雙邊 85%；不保證三秒或任意歌曲準確率。完整數字見 [驗證報告](three-second-alignment-report.md)。

公開 API 與 contractVersion 保持 1；消費端若鎖定 libraryVersion 須改為 1.0.1。安裝 npm install lyric-align-ts@1.0.1，靜態部署須一起更新 dist/ 與 assets/，保留 COOP／COEP 標頭。
