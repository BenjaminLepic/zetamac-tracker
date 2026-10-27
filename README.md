# Zetamac recorder

A local Chrome / Edge extension that automatically recognizes games on [Zetamac](https://arithmetic.zetamac.com/). Recording is the main feature. Local recording needs no account, server, subscription or build step. Version 1.1 adds optional Google Drive sync.

## Install once

1. Keep this `zetamac-tracker` folder somewhere permanent. If you downloaded the ZIP, unzip it first.
2. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge, and turn on **Developer mode**.
3. Choose **Load unpacked** and select this folder (the folder containing `manifest.json`).
4. Open or **reload Zetamac**, then start a game normally. A small **Training log** panel appears in the bottom right. During a game its label shows the number correct and “recording”. When the timer ends it shows “Saved”.

No terminal commands or npm installation are needed to use it. Loading the extension into your normal browser profile is the remaining manual step; the supplied automated tests use their own temporary browser profile.

## What gets recorded

Each game has a unique ID and saves:

- The observed start and end time, local date, timezone, browser version, settings, final score and completion status.
- Every observed question, operation, operands, expected answer and time shown.
- Every keydown and keyup in the answer field: key, physical key code, modifier keys, repeat flag, selection and value before the press. Releases are linked to their press, even when the answer has already advanced to the next question.
- Before-input events and the full input value after each edit, including backspaces, paste and composition input. Full input values retain leading zeros and partially typed answers.
- Correctness confirmed by Zetamac's score increment, accepted input and elapsed response time. An incomplete answer prefix is **not** treated as a wrong answer.
- Focus changes in the answer field, tab visibility and optional changes to conditions.

Events have an increasing `seq` number and an `atMs` offset from the first observed question. A question has `shownMs`, `solvedMs` and `responseMs`. Add the offset to `startedAt` for an approximate wall-clock timestamp. Timings measure observed browser events, not internal server timing.

The recorder uses the score increment to recognize acceptance. Identical consecutive questions remain separate records. The final unsolved question is retained. A game joined partway through includes `initialScore`, `initialSecondsLeft` and a warning. Unknown game settings are kept and excluded from default-settings comparisons.

**Scope:** keys are collected only inside Zetamac's answer field during a game. Other sites, other applications, settings fields and metadata notes are not keylogged. Keys released after leaving the field may not be observable. The extension does not answer questions or change Zetamac's game logic.

## Google Drive sync

This build includes the configured Google OAuth client. Open **Records & backups** and choose **Connect Google Drive**. Approve access to the application's own data folder. It does not request access to your other Drive files.

Connecting uploads existing local game records, including full questions, key events and notes, and downloads records from that same Google account on other computers. Completed games and edits queue background sync after about 30 seconds; a periodic check runs about every two minutes while Chrome is running. **Sync now** runs a check immediately. Browser scheduling and network conditions can delay these checks. Games still record locally when offline. Older in-progress checkpoints can also sync after 45 seconds without edits; current game activity is never uploaded on every keypress.

Use a separate Chrome profile for each Google account. Both requested accounts are permitted to connect; each keeps its own private Drive history. The extension connects one account per browser profile. Connecting another account after disconnecting uploads the records currently in that profile, so use separate profiles when you want histories to stay separate.

The account email, last successful sync and any errors appear in the sync panel. **Disconnect** pauses syncing and clears the extension's cached Google tokens. It keeps local and remote records; it does not delete your Drive data or revoke the app's authorization on Google's account settings page.

Google authentication for this build uses Google Chrome's Identity API. Local recording and JSON export also work in Edge; Google account sync in Edge is not configured in this release.

The hidden Drive app-data folder is not browsable in Drive's normal file interface. Use the extension's JSON export to keep a readable, portable backup. Sync uses immutable game revisions, so recorded answers and annotations merge independently. Deletions propagate via a deletion marker. An explicit JSON import can restore a deleted game. Each changed revision can occupy additional Drive storage.

If the panel says **Google setup is not configured yet**, the project owner must complete [Google configuration](GOOGLE_SYNC_SETUP.md). Sign-in alone cannot enable an unconfigured OAuth client.

### Upgrade from the original recorder

The sync build has a fixed extension ID so Google login works on different computers. Its ID is `gnlfkgljonacgidhoagoldhhehjlnenb`.

1. In your old extension, choose **Export backup** before removing or changing anything.
2. Load the new `zetamac-tracker-sync` folder as an unpacked extension. If you already use the fixed ID, reload that installation instead.
3. Import your backup in the new extension, then connect Google Drive.
4. Once your records are verified, disable the old recorder so two versions do not record the same game.
5. On another computer, load this same new build and connect the same Google account. Records download automatically.

The old installation is left intact while this separate update is prepared. Chrome does not automatically migrate storage between different extension IDs. No recorded games are automatically committed to GitHub.

## Conditions are optional

Expand the Training log panel to choose music, location, meeting status and glasses, or leave them unknown. A notes field accepts other context. Choices carry over to your next game. Changing a condition during a game also creates a timestamped lifecycle event. Notes save when you leave the notes field.

You do not need to choose useful metadata in advance. Scores, per-operation timing, first-key latency, corrections and key intervals can be analyzed later from the raw data. The dashboard provides descriptive comparisons; it does not infer that music or glasses caused a difference.

## Save and export

Every answer-field event schedules a local checkpoint in the same task, and a background worker serializes storage writes. Games save automatically. The panel has a **Download this record** button that exports the current in-memory record even if browser storage reports a failure.

Click the extension's toolbar icon for records and backups:

- **Export backup** downloads all sessions, questions, raw events and metadata as JSON. This is the complete export format.
- Open a session and choose **Export raw JSON** for that session, or **Export event CSV** for a flattened event table. CSV is a convenience view; use JSON to preserve every field, including lifecycle events and modifier flags.
- **Import** merges a JSON backup by session ID. Matching IDs are replaced, so import while no game is running. Reimporting a backup does not duplicate its sessions.
- Conditions and dates can be edited; raw question/event data is retained. A running recorder's panel controls its conditions; avoid editing that session elsewhere until the game ends.

Storage is local to the browser profile. With Drive disconnected, the extension makes no network requests. When connected, it sends complete records to Google Drive using only the `drive.appdata` OAuth scope. It requests `storage`, `unlimitedStorage`, `identity`, `alarms` and API access to `https://www.googleapis.com/*`, with a content script restricted to `https://arithmetic.zetamac.com/*`. Zetamac's own normal requests are unchanged. Google tokens are managed by Chrome's Identity API; they are not included in backups or stored in the repository.

Export backups regularly. Removing the extension or clearing its data deletes local records. Reloading an unpacked extension preserves its storage when its folder stays the same. The folder itself is **not** where Chrome stores recorded sessions.

A normal navigation checkpoints a partial game. A crash or abrupt browser shutdown can lose events that have not finished writing; the last stored checkpoint remains, possibly with status `recording`. The records list labels unfinished games **Partial** and excludes them from score trends. Wait for “Saved” after a finished game before closing its tab.

## Your original results

The extension imports the 16 supplied scores once, dated **26 October 2024**, in the supplied order. There is no invented time of day or keystroke detail. Meeting is “no” for all 16. Only session 12 has glasses; the last four sessions are home. Their average is **44.5625** and their best score is **57**.

The included `historical-scores.json` file is a backup of those records. They are also built into the extension, so importing it is optional.

## Default-settings classification

Verified against Zetamac's page and game module on 26 October 2026: duration 120 seconds; all four operations; addition operand ranges 2–100 by 2–100; multiplication 2–12 by 2–100; subtraction/division reverse those generated problems. Actual settings are preserved per new game, and custom games are kept separately.

## Dashboard preview

Opening `dashboard.html` as a normal file displays the historical records and permits local manual entries and backups. **That preview cannot record games.** Its browser storage is separate from the installed extension. Import a preview backup into the extension if you made entries there.

## Verification / development

Runtime has no dependencies. `npm run test:sync` tests the sync engine without a browser or Google account. To run the included automated integration test, use Node.js 20+:

```sh
npm install
npx playwright install chromium
npm test
```

Tests load the real extension into a temporary Chrome for Testing profile, fetch the current Zetamac game module, block score-log submissions, and exercise real input events. They check corrections, identical successive questions, non-keyboard input, metadata isolation and carry-over, completion, custom settings, partial-game persistence, raw JSON export, backup round trips, and storage across browser restarts. The sync tests use a simulated Drive service to check cross-device merges, deletion markers, account isolation, expired tokens, retry behavior, and offline recording. They also check the dashboard for JavaScript errors and narrow-screen overflow. Test-generated games stay in the temporary profile.

If Zetamac changes its DOM or its module's settings format, the selectors/parser may require an update. Current capture points are `#game .problem`, `#game .correct`, `#game input.answer`, and the inline module's `init({...})` call.
