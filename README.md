# 賓果賓果預測

台灣賓果賓果（Bingo Bingo）選號預測與冷熱號分析網站。

## 如何開啟

### 方法一：直接開檔（最快）

用瀏覽器直接開啟專案根目錄的 `index.html`（已內嵌樣式與腳本，不需伺服器）。

### 方法二：本機伺服器

```bash
./script/server
```

或：

```bash
python3 -m http.server 8000
```

然後開啟 http://127.0.0.1:8000/

### 方法三：GitHub Pages

1. 合併 PR 到 `master`
2. 到 repo **Settings → Pages**
3. Build and deployment → Source 選 **GitHub Actions**
4. 部署完成後網址約為：`https://jing-qin18.github.io/github-slideshow/`

> 目前此 repo 尚未啟用 GitHub Pages，需在 Settings 手動開啟一次。

## 功能

- **智慧選號**：熱號、冷號、遺漏、單雙平衡、大小平衡、均衡混合、純隨機
- **冷熱號盤面**：近 100 期模擬開獎的頻率熱力圖
- **大小 / 單雙趨勢**：近 30 期分佈與提示
- **歷史開獎一覽**：模擬期號與號碼球展示

> 本站使用本地模擬歷史資料，僅供娛樂參考，不保證中獎。
