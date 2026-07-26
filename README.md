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
