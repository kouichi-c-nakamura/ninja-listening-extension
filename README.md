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

This same folder works in Firefox too, with minor tweaks (see "Porting to
Firefox" below) if you want that later.

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

## Porting to Firefox

Firefox supports the same WebExtensions APIs. The main changes needed:
- Add a `browser_specific_settings` block to `manifest.json` with an
  extension ID.
- Firefox is stricter about Manifest V3 `action`/background details but
  this extension has no background service worker, so it should load with
  little to no change via `about:debugging` → "Load Temporary Add-on".

## Known limitations / good next steps

- If YouTube changes the CSS class name of the CC button, caption toggling
  will silently stop working until the selector is updated.
- No keyboard shortcuts yet (e.g. hotkeys for mark start/end/run).
- No visual progress bar for the current fragment loop (status text only).
- No import/export of step sequences between browsers/profiles beyond
  Chrome's built-in sync.
