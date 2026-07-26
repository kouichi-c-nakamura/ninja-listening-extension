# Ninja Listening Trainer for YouTube

A small browser extension that lets you mark a fragment of any YouTube video
and replay it automatically through a customizable sequence of playback
speeds and subtitle on/off states — built for the "Ninja method" of
listening/pronunciation practice.

## Install (unpacked, for yourself or to share with friends)

1. Unzip this folder somewhere permanent (don't delete it after installing —
   Chrome loads the extension directly from these files).
2. Open `chrome://extensions` (or `edge://extensions` in Edge).
3. Turn on **Developer mode** (toggle, usually top-right).
4. Click **Load unpacked** and select this folder.
5. The extension is now active on any `youtube.com/watch` page.

This same folder now works in Firefox too — see "Install on Firefox" below.

## How to use

1. Open any YouTube video.
2. A small "Ninja Listening Trainer" panel appears in the bottom-right
   corner.
3. Play the video normally to the point where you want your practice
   fragment to start, click **Mark start**. Do the same at the point you
   want it to end, click **Mark end**.
4. Click **▶ Run sequence**. The video will automatically loop through the
   fragment at each configured speed/subtitle step, pausing at the end of
   the fragment each time before moving to the next step.
5. Click **■ Stop** any time to interrupt the sequence.
6. To do the next chunk of the video, just play forward, mark a new
   start/end, and run again.

Your marks are remembered per video (so you can come back later), and the
step sequence itself is shared across all videos.

## Customizing the step sequence

Click the extension's icon in the toolbar → **Edit step sequence** (or right
click the icon → Options). From there you can:

- Change the playback speed of any step
- Toggle subtitles on/off per step
- Reorder steps (↑ / ↓)
- Add or remove steps
- Reset to the default Ninja sequence

The default sequence is:

```
1.0x  no subtitles
1.0x  subtitles
0.6x  subtitles   (x3)
0.7x  subtitles
0.8x  subtitles
0.9x  subtitles
1.0x  no subtitles
1.1x  no subtitles
1.2x  no subtitles
1.3x  no subtitles
1.4x  no subtitles
1.5x  no subtitles
```

## How it works (short version)

- A content script runs directly on the YouTube page and grabs the real
  `<video>` element — no iframe, no YouTube API quota.
- Subtitles are toggled by clicking YouTube's own CC button
  (`.ytp-subtitles-button`), which is the only reliable way to control
  native captions (the YouTube IFrame API no longer exposes this).
- Marks are stored with `chrome.storage.local` (per browser profile) keyed
  by video ID; the step sequence is stored with `chrome.storage.sync` so it
  follows you across signed-in Chrome profiles.

## Sharing this with others

Two options, from least to most effort:

1. **Zip and send the folder** (what you have now) — others load it as an
   "unpacked" extension via developer mode. Free, but a little friction
   (a handful of clicks, and Chrome will occasionally nag about developer
   mode extensions).
2. **Publish to the Chrome Web Store** — costs a one-time $5 developer
   registration fee. Once published (even as an "unlisted" link you only
   share with people you choose), anyone can install it with a single
   "Add to Chrome" click, and it auto-updates. This is the way to go once
   you're happy with it.

## Install on Firefox

This same folder is now Firefox-compatible (no code changes needed — just
one extra key in `manifest.json`).

**For your own testing:**
1. Go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and select any file inside this folder
   (e.g. `manifest.json`).
3. It works immediately, but resets when Firefox restarts — fine for
   trying it out, not for daily use.

**For a permanent install (yourself or sharing with others):**
Firefox requires every add-on to be signed by Mozilla before it can be
installed permanently, even for private/unlisted use. This is free and
takes a few minutes:
1. Create a free account at
   [addons.mozilla.org/developers](https://addons.mozilla.org/developers/).
2. Zip up this folder's *contents* (not the folder itself — `manifest.json`
   should be at the root of the zip).
3. Go to "Submit a New Add-on" → choose **"On your own"** (unlisted) rather
   than the public store, so it's not publicly searchable.
4. Upload the zip. Mozilla auto-signs it, usually within a few minutes.
5. Download the signed `.xpi` file it gives you back and share that — it
   installs permanently in Firefox with a simple drag-and-drop onto
   `about:addons`, no store listing required.


## Local audio files (mp3, m4a, wav, ogg, flac, aac…)

Two ways to do this now — pick whichever fits how you work, or use both.

### Option A: file picker page (no setup required)

Click the extension's toolbar icon → **Open local audio player**. This
opens a dedicated page with a file picker — choose or drag in a file, and
the same mark/run controls appear on that page. Works immediately, no
extra permissions to grant.

### Option B: open the file directly via `file://` (floating overlay, like YouTube)

If you'd rather just type or navigate to a file path directly (e.g. you
keep a fixed practice folder and want quick access), you can open the
audio file itself as a browser tab — `file:///Users/you/practice/clip.mp3`
— and the same floating panel from the YouTube version appears as an
overlay on that page.

**Required one-time setup (this is a hard browser restriction, not
something any manifest setting can skip):**
1. Go to `chrome://extensions`.
2. Find "Ninja Listening Trainer for YouTube" → click **Details**.
3. Turn on **"Allow access to file URLs"**.
4. (Firefox: `about:addons` → the extension → Permissions → enable file
   access; wording varies by version.)

This toggle is scoped to *this specific extension only* — it isn't a
blanket "read all files" grant to every extension, and it can be turned
off again just as easily. It occasionally resets after certain updates or
reinstalls, so if file-mode suddenly stops working, this is the first
thing to check.

To keep the content script from running on *every* local file you ever
open, `manifest.json` scopes it to common audio extensions specifically
(`file:///*.mp3`, `file:///*.m4a`, `file:///*.wav`, `file:///*.ogg`,
`file:///*.oga`, `file:///*.flac`, `file:///*.aac`, `file:///*.weba`)
rather than a blanket `file:///*`. One limitation: these patterns are
case-sensitive, so a file named `Track.MP3` (uppercase extension) won't
match — rename it, or use Option A instead.

### Both options share the same settings

- The step sequence (Options page) is shared across YouTube, the file
  picker page, and `file://` mode — configure it once.
- Marks are remembered per file: Option A keys by filename + file size;
  Option B keys by the exact file:// path, since that's already a stable
  identifier.
- Neither has captions/CC — there's nothing to toggle for a plain audio
  file, so the `subtitles` field on each step is simply ignored in both.
- No playback-rate "enforcer" hack is needed for either — that trick
  existed only to fight YouTube's own player periodically resetting the
  rate. A plain `<audio>` element doesn't do that, so `audio.playbackRate
  = x` just sticks.

## Known limitations / good next steps

- If YouTube changes the CSS class name of the CC button, caption toggling
  will silently stop working until the selector is updated.
- No keyboard shortcuts yet (e.g. hotkeys for mark start/end/run).
- No visual progress bar for the current fragment loop (status text only).
- No import/export of step sequences between browsers/profiles beyond
  Chrome's built-in sync.



# Ninja Listening Trainer for YouTube

YouTube動画の任意の区間をマークし、カスタマイズ可能な再生速度と字幕のオン/オフのシーケンスに従って自動的にリピート再生できる、小規模なブラウザ拡張機能です。リスニングおよび発音練習の「忍者メソッド」のために構築されました。

## インストール（パッケージ化されていない拡張機能として自分用、または友人と共有用）

1. このフォルダをパソコン上の恒久的な場所（削除しない場所）に展開（解凍）します（Chromeはこれらのファイルから直接拡張機能を読み込むため、インストール後も削除しないでください）。
2. ブラウザで `chrome://extensions` （Edgeの場合は `edge://extensions`）を開きます。
3. **デベロッパーモード** をオンにします（通常は右上のトグルスイッチです）。
4. **「パッケージ化されていない拡張機能を読み込む」** をクリックし、このフォルダを選択します。
5. これで拡張機能がインストールされ、すべての `[youtube.com/watch](https://youtube.com/watch)` ページで有効になります。

この同じフォルダはFirefoxでも動作するようになりました。詳しくは後述の「Firefoxでのインストール」をご覧ください。

## 使い方

1. 任意のYouTube動画を開きます。
2. 右下に「Ninja Listening Trainer」の小さなパネルが表示されます。
3. 動画を通常通り再生し、練習したい区間の開始位置で **Mark start** をクリックします。終了位置でも同様に **Mark end** をクリックします。
4. **▶ Run sequence** をクリックします。設定された速度/字幕の各ステップに従って、指定した区間が自動的にループ再生されます。各ループの終わりで一時停止した後、次のステップに進みます。
5. シーケンスを中断するには、いつでも **■ Stop** をクリックしてください。
6. 動画の次の区間に進むには、そのまま動画を再生し、新しく開始/終了位置をマークして、再度実行します。

マークした位置は動画ごとに記憶されるため（後で再開可能です）、ステップのシーケンス設定自体はすべての動画で共有されます。

## ステップシーケンスのカスタマイズ

ツールバーにある拡張機能のアイコンをクリックし、**Edit step sequence** を選択します（またはアイコンを右クリックして「オプション」を選択）。設定画面では以下のことが可能です：

* 各ステップの再生速度の変更
* ステップごとの字幕のオン/オフの切り替え
* ステップの並び替え（↑ / ↓）
* ステップの追加または削除
* デフォルトのNinjaシーケンスへのリセット

デフォルトのシーケンスは以下の通りです：

```
1.0x  字幕なし
1.0x  字幕あり
0.6x  字幕あり   (x3)
0.7x  字幕あり
0.8x  字幕あり
0.9x  字幕あり
1.0x  字幕なし
1.1x  字幕なし
1.2x  字幕なし
1.3x  字幕なし
1.4x  字幕なし
1.5x  字幕なし

```

## 仕組み（簡易版）

* コンテンツスクリプトがYouTubeのページ上で直接実行され、実際の `<video>` 要素を取得します。iframeやYouTube APIのクオータ（制限）は使用しません。
* 字幕の切り替えは、YouTube自身のCCボタン（`.ytp-subtitles-button`）をクリックすることで行われます。これはネイティブの字幕を制御するための唯一の信頼できる方法です（YouTube IFrame APIではこの機能は提供されなくなりました）。
* マーク位置は動画IDをキーとして `chrome.storage.local`（ブラウザプロファイルごと）に保存されます。ステップのシーケンスは `chrome.storage.sync` で保存されるため、ログインしているChromeプロファイル間で同期されます。

## 他の人との共有

手間の少ない順に2つの方法があります：

1. **Zip化してフォルダを送る**（現在の状態） — 受け取った人はデベロッパーモード経由で「パッケージ化されていない」拡張機能として読み込みます。無料ですが、少し手間がかかります（数回のクリックが必要で、Chromeからデベロッパーモードの拡張機能に関する警告が時々出ます）。
2. **Chromeウェブストアに公開する** — 1回限り5ドルの開発者登録料がかかります。公開すれば（特定の人のみに共有する「限定公開」リンクであっても）、誰でも「Chromeに追加」を1回クリックするだけでインストールでき、自動でアップデートされます。満足のいく仕上がりになれば、こちらの方法がおすすめです。

## Firefoxでのインストール

この同じフォルダがFirefoxにも対応しました（コードの変更は不要で、`manifest.json` にキーを1つ追加しただけです）。

**自分でのテスト用:**

1. `about:debugging#/runtime/this-firefox` を開きます。
2. **「一時的なアドオンを読み込む」** をクリックし、このフォルダ内の任意のファイル（例: `manifest.json`）を選択します。
3. すぐに動作しますが、Firefoxを再起動するとリセットされます。お試しには適していますが、日常使いには向きません。

**恒久的なインストール用（自分用または他の人との共有用）:**
Firefoxでは、プライベート用や限定公開であっても、恒久的にインストールする前にすべてのアドオンがMozillaによって署名されている必要があります。これは無料で、数分で完了します：

1. [addons.mozilla.org/developers](https://addons.mozilla.org/developers/) で無料アカウントを作成します。
2. このフォルダの「中身」をZip化します（フォルダそのものではなく、`manifest.json` がZipのルート（最上層）に来るようにしてください）。
3. 「新しいアドオンの登録」に進み、公開ストアではなく **「自分で配信（On your own）」**（限定公開）を選択します。これにより一般検索には表示されなくなります。
4. Zipファイルをアップロードします。Mozillaが自動的に署名を行い、通常は数分で完了します。
5. 返却された署名済みの `.xpi` ファイルをダウンロードして共有します。ストアに登録しなくても、`about:addons` 画面にドラッグ＆ドロップするだけで、Firefoxに恒久的にインストールできます。

## ローカル音声ファイル (mp3, m4a, wav, ogg, flac, aac…)

現在2つの方法があります。ご自身の使い方に合う方を選ぶか、両方を使用してください。

### オプションA: ファイル選択ページを使用する（設定不要）

ツールバーの拡張機能アイコンをクリックし、**Open local audio player** を選択します。ファイル選択機能がある専用ページが開くので、ファイルを選ぶかドラッグして読み込みます。YouTube版と同じ開始/終了マークや実行コントロールが表示されます。追加の権限設定などは不要で、すぐに使用できます。

### オプションB: `file://` で直接ファイルを開く（YouTubeのようなフローティングパネル）

ファイルパスを直接入力したり移動したりする方が好きな場合（例: 練習用のフォルダが決まっていて、素早くアクセスしたい場合）、ブラウザのタブとして音声ファイルそのもの（例: `file:///Users/you/practice/clip.mp3`）を開くことができます。すると、YouTube版と同じフローティングパネルがそのページ上にオーバーレイ表示されます。

**初回に必要な設定（これはブラウザの厳しい制限であり、manifestの設定等では回避できません）:**

1. `chrome://extensions` を開きます。
2. 「Ninja Listening Trainer for YouTube」を見つけ、**「詳細」** をクリックします。
3. **「ファイルの URL へのアクセスを許可する」** をオンにします。
4. (Firefoxの場合: `about:addons` → 該当の拡張機能 → 「権限（Permissions）」タブからファイルアクセスを許可します。※バージョンにより表記が異なる場合があります。)

この設定は *この拡張機能のみ* に適用されるものであり、すべての拡張機能に「すべてのファイルを読み込む」権限を無条件に与えるものではありません。また、いつでも簡単にオフに戻すことができます。アップデートや再インストールの際に設定がリセットされることがあるため、もしファイルモードが急に機能しなくなった場合は、まずこの設定を確認してください。

コンテンツスクリプトが、開いた *すべての* ローカルファイルで実行されないようにするため、`manifest.json` では無条件の `file:///*` ではなく、一般的な音声ファイルの拡張子（`file:///*.mp3`, `file:///*.m4a`, `file:///*.wav`, `file:///*.ogg`, `file:///*.oga`, `file:///*.flac`, `file:///*.aac`, `file:///*.weba`）にスコープを絞っています。1つ制限事項として、これらのパターンは大文字と小文字を区別するため、`Track.MP3` のように拡張子が大文字のファイルには一致しません。その場合はファイル名を変更するか、代わりにオプションAを使用してください。

### どちらのオプションも設定は共有されます

* ステップのシーケンス（オプションページ）は、YouTube、ファイル選択ページ、および `file://` モードのすべてで共有されます（設定は1回で済みます）。
* マーク位置はファイルごとに記憶されます。オプションAは「ファイル名＋ファイルサイズ」をキーにし、オプションBは安定した識別子である「正確な file:// パス」をキーにします。
* どちらにも字幕/CC機能はありません。単純な音声ファイルには切り替える字幕が存在しないため、各ステップの `subtitles`（字幕）の設定はどちらのモードでも単に無視されます。
* どちらのモードでも、再生速度の「強制適用」ハックは不要です。あのトリックは、YouTube自身のプレイヤーが定期的に再生速度をリセットする仕様に対抗するためのものでした。純粋な `<audio>` 要素はそのような動作をしないため、`audio.playbackRate = x` の設定がそのまま維持されます。

## 既知の制限事項 / 今後の課題

* YouTubeがCCボタンのCSSクラス名を変更した場合、セレクタが更新されるまで字幕の切り替え機能が警告なしに動作しなくなります。
* キーボードショートカットはまだありません（例: 開始/終了のマークや実行などのホットキー）。
* 現在ループしている区間の視覚的なプログレスバーはありません（ステータステキストのみです）。
* Chrome内蔵の同期機能を除き、ブラウザやプロファイル間でのステップシーケンスのインポート/エクスポート機能はありません。