# 1.0.1 歌曲對齊驗證

使用者已明確同意排除 TEN-VAD 並接受準確率改變。本版不包含、下載或執行 TEN-VAD；保留其他已接受設定，改為正式 Worker 的預設配置。句尾不再經人聲模型修正，不能沿用含 VAD 的準確率宣稱。

## 正式預設配置

tiny Q5_1、8 執行緒、CPU/WASM、1.5 倍 mel 時間壓縮、640 audio context、四區塊 encoder 注意力、openPrefix joint、posterior ends、lyric pauses，profiling 關閉。矩陣工作分配將相鄰四個 row tiles 交同一執行緒。獨立 ASR 會暫時切回完整 encoder 注意力與 1500 context，完成或失敗都恢復對齊設定。

## 六首完整流程實測

使用正式 dist/index.js 與 dist/worker.js，沒有實驗 Worker 或個別歌曲參數。每首新建實例，各一次。計時 metrics.operationSeconds 包含音訊準備、傳輸、推論、句子配對與 SRT，初始化與下載另計。誤差為全句平均絕對誤差，嚴格以 <1 秒計數，未排除離群句。

| 歌曲 | 句首誤差 | 句首 <1 秒 | 句尾誤差 | 句尾 <1 秒 | 耗時 |
|---|---:|---:|---:|---:|---:|
| Amazing Grace | 0.560 秒 | 11/12（91.7%） | 1.070 秒 | 7/12（58.3%） | 1.815 秒 |
| SUNEO-ISM. | 0.432 秒 | 114/125（91.2%） | 0.311 秒 | 116/125（92.8%） | 3.853 秒 |
| 春泥棒 | 1.158 秒 | 48/56（85.7%） | 0.931 秒 | 44/56（78.6%） | 3.359 秒 |
| Green | 0.752 秒 | 31/38（81.6%） | 1.106 秒 | 21/38（55.3%） | 3.688 秒 |
| Boys Will Be Bugs | 0.549 秒 | 82/88（93.2%） | 0.782 秒 | 81/88（92.0%） | 3.839 秒 |
| Lift Every Voice and Sing | 0.431 秒 | 17/19（89.5%） | 1.254 秒 | 14/19（73.7%） | 2.381 秒 |

SUNEO-ISM. 與 Boys Will Be Bugs 的句首句尾皆達 85%；其餘四首至少一邊未達標。六首皆未同時達到原雙邊 85% 與三秒門檻。本版不保證所有歌曲 85% 或三秒內；耗時亦受硬體及負載影響。

可靠度分數：99%（限本機本次直接量測與門檻判定），不代表其他歌曲的泛化能力。

## 重現證據

Chrome 155、AMD Ryzen 5 3600、Windows；模型 SHA、程式與輸入雜湊、公開輸出與評分均保存於 .local/three-second/1792874722760-release-1-0-1-no-vad-six。設定 .local/release-1.0.1-six.json，執行 node scripts/benchmark-three-second.mjs .local/release-1.0.1-six.json。品質或三秒門檻未達時 exit code 1 是正式失敗結果，不是程序當機。

原始歌曲、參考字幕、Whisper 模型與研究用 VAD 資產均不隨 npm 套件發佈。所有結果僅代表 createAligner 的已知歌詞對齊，不能用來宣稱獨立 ASR/session 的歌曲準確率。
