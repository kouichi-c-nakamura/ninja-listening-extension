
# Ninja Listening Trainer for YouTube & Audio

A lightweight browser extension that lets you mark a fragment of any YouTube video or local audio file and replay it automatically through a customizable sequence of playback speeds and subtitle on/off states — built for the "Ninja method" of listening and shadowing practice.

---

## 🚀 Quick Install

Install directly from your browser's official addon store with 1-click:

- **Chrome / Edge / Brave / Chromium:**  
  👉 [**Chrome Web Store**](https://chromewebstore.google.com/detail/ninja-listening-trainer-f/mdcdlhjhdpebakceoeolpnlfkhkbicjj)
- **Firefox:**  
  👉 [**Firefox Add-ons (AMO)**](https://addons.mozilla.org/ja/firefox/addon/ninja-listening-trainer/)

> **Firefox Note:** Right after installing on Firefox, open `about:addons` → **Ninja Listening Trainer** → **Permissions** tab, and toggle ON **"Access your data for https://www.youtube.com"** so the overlay can appear on YouTube.

---

## 🛠️ How to Use

1. **Open Media:** Navigate to any YouTube video (or open a local audio file).
2. **Mark Fragment:** Play to where your target sentence starts and click **Mark start**. Play to where it ends and click **Mark end**.
3. **Run Sequence:** Click **▶ Run sequence**. The player automatically iterates through each speed and subtitle step.
4. **Stop / Adjust:** Click **■ Stop** anytime to pause or click any step in the list to jump straight to that speed.

### Visual Analogue Scale (VAS) Research Mode
- Check **Collect VAS Ratings** to prompt an acoustic clarity rating slider after each iteration step.
- Click **Export Data** to download your session logs as a `.csv` file for statistical analysis.

---

## ⚙️ Customizing Steps & Presets

- **Built-in Presets:** Quickly select the **Ninja Protocol (0.6x Anchor)**, **Pure Compression**, or **Static Control** directly from the UI dropdown.
- **Custom Sequence:** Click the **⚙ (Settings)** button or extension icon to open options. You can freely edit speeds, subtitle states, reorder, or add custom steps.
- **Import / Export JSON:** Use the **Load** button to import structured `.json` configuration files for structured lessons.

---

## 📁 Local Audio Files

- **Option A (File Picker):** Click the toolbar icon → **Open local audio player** to drag and drop `.mp3`, `.m4a`, `.wav`, or `.flac` files directly.
- **Option B (Direct `file://` URL):** Open any local audio URL directly in a tab. (Requires enabling *"Allow access to file URLs"* in your browser's extension settings).

---

<details>
<summary><b>🔧 Manual Install & Development (Click to expand)</b></summary>

### For Developers (Load Unpacked)
1. Clone this repository.
2. Open `chrome://extensions` (Chrome/Edge) or `about:debugging` (Firefox).
3. Enable **Developer mode** and click **Load unpacked** (or **Load Temporary Add-on** in Firefox).
4. Select the repository root folder.

### Building ZIP Package
```bash
python3 make_zip.py
# or
zip -r -X ../ninja-listening-extension.zip . -x ".*"



# Ninja Listening Trainer for YouTube & 音声ファイル（日本語版ガイド）

YouTube動画やローカル音声ファイルの任意の区間をマークし、カスタマイズ可能な再生速度と字幕のオン/オフのシーケンスに従って自動的にリピート再生できるブラウザ拡張機能です。「忍者メソッド」によるリスニング・シャドーイング練習や知覚研究のために設計されました。

---

## 🚀 インストール方法

お使いのブラウザの公式ストアから、1クリックで簡単にインストールできます：

* **Chrome / Edge / Brave 等 (Chromium系):**
👉 **[Chrome ウェブストアから追加](https://chromewebstore.google.com/detail/ninja-listening-trainer-f/mdcdlhjhdpebakceoeolpnlfkhkbicjj)**
* **Firefox:**
👉 **[Firefox Add-ons (AMO) から追加](https://www.google.com/url?sa=E&source=gmail&q=https://addons.mozilla.org/ja/firefox/addon/ninja-listening-trainer/)**

> **⚠️ Firefoxをご利用の方へ（初回のみ）:**
> インストール直後、`about:addons` を開き、「Ninja Listening Trainer」の **「権限」** タブから **「https://www.youtube.com の保存されたデータへのアクセス」** をオンにしてください（これがオフだとYouTube上にパネルが表示されません）。

---

## 🛠️ 使い方

1. **動画を開く:** 練習したいYouTube動画を開きます（またはローカル音声を開きます）。
2. **区間をマーク:** 開始したい位置で **Mark start**、終わりたい位置で **Mark end** をクリックします。
3. **シーケンス再生:** **▶ Run sequence** をクリックすると、設定された速度・字幕の組み合わせで自動的にループ再生されます。
4. **中断・ジャンプ:** いつでも **■ Stop** で停止できます。また、ステップ一覧の行をクリックしてその速度から再開することも可能です。

### VAS（明瞭度スコア）収集機能

* **「Collect VAS Ratings」** にチェックを入れると、各ステップの再生終了後に音響的明瞭度（聞き取りやすさ）を測るVASスライダーが表示されます。
* **「Export Data」** をクリックすると、記録したスコア一覧をCSVファイルとして書き出せます。

---

## ⚙️ プリセットとシーケンスのカスタマイズ

* **プリセット選択:** パネル上部のドロップダウンから **Ninja Protocol (0.6x Anchor)**、**Pure Compression**、**Static Control** を即座に切り替えられます。
* **独自シーケンスの作成:** パネルの **⚙ (設定)** アイコンをクリックして設定画面を開くと、速度の変更・字幕オンオフ・行の追加削除が自由に行えます。
* **JSONの読み込み:** **Load** ボタンから設定ファイル（`.json`）を読み込んで、決まった練習プログラムを一括適用できます。

---

## 📁 ローカル音声ファイルの再生

* **方法A (専用プレイヤー):** ツールバーのアイコンをクリック → **「Open local audio player」** から `.mp3` や `.wav` ファイルをドラッグ＆ドロップして再生します。
* **方法B (`file://` 直接指定):** ブラウザのアドレスバーに直接音声ファイルのパスを入れて開きます（※ブラウザの拡張機能管理画面で「ファイルの URL へのアクセスを許可する」をオンにする必要があります）。

---

### パッケージ化されていない拡張機能として読み込む

1. リポジトリをクローンまたは展開します。
2. ブラウザで `chrome://extensions`（Chrome/Edge）または `about:debugging`（Firefox）を開きます。
3. **デベロッパーモード** を有効にし、**「パッケージ化されていない拡張機能を読み込む」**（Firefoxは「一時的なアドオンを読み込む」）からフォルダを選択します。

### ZIPパッケージ作成

```bash
python3 make_zip.py
# または
zip -r -X ../ninja-listening-extension.zip . -x ".*"

```