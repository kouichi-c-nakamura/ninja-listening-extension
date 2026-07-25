# Ninja Listening Trainer for YouTube

Mark a fragment of any YouTube video, replay it through a customizable
speed/subtitle sequence, and — new in this version — expand to a wide view
that auto-loads the video's transcript as clickable text. Click any word to
jump straight to its OALD definition.

## Install (unpacked)

1. Unzip this folder somewhere permanent.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select this folder.
5. Open (or refresh) a `youtube.com/watch` page.

**If you're upgrading from an earlier version:** this update adds a
background service worker and a new `scripting` permission (needed to read
YouTube's caption data reliably — see "How the transcript feature works"
below). Chrome may show a permission-review prompt on reload; just approve
it. If the extension appears greyed out after reloading, click into its
details and re-enable it.

## How to use

**Mini view** (unchanged): mark a fragment's start/end while watching
normally, then run it through the speed/subtitle sequence.

**Wide view**: click the "⤢" button in the panel header. It widens and
automatically:
1. Asks the background service worker to read the video's available
   caption tracks.
2. Loads a default track (prefers manually-created English, falls back to
   auto-generated, falls back to whatever's first).
3. Shows the transcript as clickable text, synced to playback — the
   current line highlights as the video plays.

- **Click a word** → opens its definition on
  [OALD](https://www.oxfordlearnersdictionaries.com/) in a new tab.
- **Click anywhere else on a line** → jumps the video to that timestamp.
- **Track dropdown** → switch between available caption tracks (e.g.
  "English" vs "English (auto-generated)") if the video has more than one.
- **"Run diagnostics" button** → re-runs the whole load process and prints
  a pass/fail log — see below.

## How the transcript feature works (and why it needed a rebuild)

A content script runs in an "isolated world": it shares the page's DOM but
**not** the page's own JavaScript variables or the methods YouTube's player
attaches to itself. That means straightforward attempts like reading
`window.ytInitialPlayerResponse` or calling
`document.querySelector('#movie_player').getPlayerResponse()` **directly
from a content script** typically return `undefined`, even though that
data is clearly sitting on the page. This is almost certainly why earlier
attempts stalled — it looks like it should work, and silently doesn't.

The fix: a **background service worker** uses
`chrome.scripting.executeScript({ world: 'MAIN', ... })` to run that lookup
*inside the page's real JavaScript context*, where the data is visible, and
passes the result back to the content script via messaging
(`background.js`). This part works reliably — the diagnostics panel can
confirm the player response and list available caption tracks.

**Downloading the actual caption text over the network is now blocked.**
YouTube's `timedtext` endpoint (the one that used to serve raw caption
data) currently returns `HTTP 200` with a completely empty body for
extension/script-originated requests — almost certainly a proof-of-origin
token requirement introduced to stop exactly this kind of scraping. This
extension does not attempt to forge or bypass that token.

Instead, the **"Capture from playback" button reads captions the way a
human would**: it plays your marked fragment once, with captions on, and
records the caption text actually rendered on screen (from
`.ytp-caption-segment` elements) along with its timing. This sidesteps the
blocked endpoint entirely, works reliably, but does take real time — about
the length of your marked fragment, played at 1x — and requires a fragment
to already be marked (Mark start / Mark end) before you click it.

## Debugging with the diagnostics panel

Click **Run diagnostics** in the wide view any time. It logs each stage in
order, in green (pass) or red (fail):

1. Background service worker reachable at all?
2. Did the page return a player response object, and from which source
   (`movie_player.getPlayerResponse()` vs `window.ytInitialPlayerResponse`)?
3. Does that object contain `captions.playerCaptionsTracklistRenderer`
   with at least one track? Lists every track found, with language and
   whether it's auto-generated.
4. Attempts to download the actual caption text over the network (both a
   `fmt=json3` and a default-XML request, each tried from the content
   script and, if that fails, from the background worker). As of this
   writing, expect this to fail with an empty `HTTP 200` body — that's the
   proof-of-origin block described above, not a bug to chase further.

If steps 1–3 pass but step 4 fails, use **"Capture from playback"** instead
— that's the working path.

## Known limitations

- This relies on YouTube's internal (undocumented) data shapes. If YouTube
  changes them, a specific diagnostics step will start failing — the log
  will show which one.
- Auto-generated (ASR) captions have no real punctuation and occasionally
  odd word boundaries, so a few word-clicks may grab a slightly mis-split
  word.
- OALD is hardcoded for now (per current scope). Swapping in a dictionary
  picker later is a small change if wanted.
- No keyboard shortcuts yet for mark start/end/run.

## Firefox

Same package works via `about:debugging` → "Load Temporary Add-on" for
testing (resets on restart); a permanent install needs Mozilla's free
add-on signing (unlisted) via addons.mozilla.org/developers.
