# 開發與建置

## 需求

- Node.js ≥22.18、pnpm 11.25.0（版本固定於 package.json）。Node.js 僅用於建置／測試，使用套件的網站不需要 Node 推論伺服器。
- Docker Desktop／Docker Engine，使用 native/lock.json 固定的 Emscripten 4.0.22 image。
- Git、桌面 Chrome。原生建置、模型及測試資料放在 Git 忽略的 .local/。

## 從乾淨 checkout 建置

```sh
pnpm install --frozen-lockfile
pnpm run build:native
node scripts/native/model.mjs
pnpm run build
pnpm run typecheck
pnpm test
pnpm run test:browser
pnpm run test:contract
pnpm run test:package
```

build:native 取得固定 whisper.cpp commit，建立 self-contained checkout，套用固定運算核心與 mel/batch/subset 改動，然後編譯 parity.js/parity.wasm 並執行 mel／矩陣測試。Docker 路徑可以 DOCKER_BIN 指定。程式碼與容差不為通過測試而放寬。

build 把 browser Worker、公開 ESM、型別與四個資產打包到 dist/。tokenizer 資料下載自固定 OpenAI commit，驗證 SHA256 後移除與舊 fast 相同的 unused final token。模型權重不打進 npm 包；model.mjs 另行下載並驗證 tiny Q5_1。

session 入口另外產出 dist/binding.js 與契約型別；真實 ASR、整首配對及選用的 yt-subtitle 唯讀接線檢查見 [session 契約](session-contract.md)。test:contract 使用原生來源自帶 JFK fixture，不需要私有歌曲；全曲 fixture 可另外傳給 scripts/test-contract-browser.mjs。

## 切換實作 commit

Git 不會切換被忽略的 dist/ 與 .local/。切換 commit 後執行 `pnpm install --frozen-lockfile`、`pnpm run build:native`、`pnpm run build`，再執行相同的 typecheck／test／test:contract／test:package。原生來源及 parity.js／parity.wasm 有 build-proof 指紋，build 拒絕另一版的殘留原生資產；pack 也會拒絕與目前來源不同或混用的 dist。NATIVE_BUILD_DIR 僅接受來源及二進位指紋均相符的建置。

build:native 會清除自身 CMakeCache.txt，避免前一個 commit 的實驗選項殘留；不刪除其他檔案。自由 ASR 進入時關閉 alignment-only 與快速近似、使用完整 1500-frame context，退出時還原整數／小數時間尺度及原本的快速設定。這些防護不表示任意歷史 commit 都已具有 session API。

本機已有可信的 WASM 建置時，可明示設定 NATIVE_BUILD_DIR 供 build 使用；不能以此宣稱重新編譯已通過。build 會清理專案內的 dist/，不修改模型或測試輸入。

## 測試分類

- pnpm test：platform-neutral regression、公開 API／音訊／字幕、tokenizer 與 DTW fixtures、native source pinning。需要先 build 準備 tokenizer 測試資產。
- pnpm run test:browser：真實 Chrome、WASM encoder/decoder、同實例重複使用、HTTP／SHA256 錯誤與取消。使用 silence smoke，不作為準確度證據。
- pnpm run test:package：產生 tarball、檢查 allowlist、離線安裝到獨立 consumer、編譯 TypeScript 使用者範例、從安裝後套件載入 Worker 與 WASM 做實際推論。
- NATIVE_SOURCE_TEST=1 node --test tests/native/*.test.mjs：額外重新產生來源並驗證已知 kernel digest 與冪等性；Windows PowerShell 請用 $env:NATIVE_SOURCE_TEST='1'。

## 真實歌曲測試

建立本機 fixtures.json，音檔與歌詞使用絕對路徑，reference 可省略；參考時間只由 Node 測試器在推論完成後讀取。

```json
{
  "songs": [{
    "id": "example",
    "audio": "/path/to/audio.wav",
    "lyrics": "/path/to/lyrics.txt",
    "language": "en",
    "reference": "/path/to/reference.srt"
  }]
}
```

```sh
node scripts/benchmark-browser.mjs /path/to/fixtures.json
```

lyrics 若為 .srt，只抽取文字。測試使用靜態伺服器提供檔案；tokenizer、推論、解碼與 DTW 全在 Chrome。結果放在 .local/package/benchmark-*/。不要與編譯或其他效能測試同時執行，也不要把含模型下載的新 metrics 與舊原型的部分階段計時混為一談。

## 範例

```sh
pnpm run dev
```

開啟 http://127.0.0.1:5175/examples/browser/。這是提供 COOP／COEP 的靜態檔案伺服器，沒有推論 API；Ctrl+C 停止。使用 PORT 可指定其他 port，不會關閉既有服務。

## 上游來源

vendor/echogarden/ 是固定版本的 browser-safe 方法與數學 helper，附來源與授權。必要時可用 scripts/vendor-engine.mjs 加上 Echogarden 3.4.0 安裝路徑明示重新產生，再檢查差異；發布／一般 build 不會動態抽取本機套件原始碼。

英文分詞使用上游預編譯規則；日中分詞使用 Intl.Segmenter。已核對指定兩首日文歌的處理結果，任意歌詞不保證與 Kuromoji／Jieba 逐值相同。
