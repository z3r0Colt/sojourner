<p align="center">
  <img src="public/brand/sojourner-lockup.png#gh-light-mode-only" alt="Sojourner" width="360">
  <img src="public/brand/sojourner-lockup-dark.png#gh-dark-mode-only" alt="Sojourner" width="360">
</p>

# Sojourner

*Bible Study Companion for Windows*

A private, offline study companion for reading Scripture alongside the historic commentaries, confessions, and reference works of the church. Everything it needs is inside the installer. There is no account, no sync service, and no network traffic: your notes, highlights, prayers, and sermons live in one file on your own computer, and you can back it up, export it, and restore it whenever you like.

## Download

Get the latest installer and the book library pack from the [releases page](../../releases/latest).

- **Sojourner_x.y.z_x64-setup.exe** installs the app. Windows 10 or 11, 64-bit; per-user, no administrator rights; the WebView2 runtime is bundled, so it installs offline.
- **Sojourner-Library-x.y.z.sjpack** is the optional library of 270 Puritan and Reformed works. Install it from inside the app: Settings → Book library → Install from file.

The installer is not yet code-signed, so Windows SmartScreen warns on first run: choose *More info*, then *Run anyway*.

## What is included

- **Ten public-domain Bible translations**: King James (1769), American Standard (1901), Young's Literal, Darby, Webster's, Geneva (1599), Douay-Rheims, Tyndale, Wycliffe, and the World English Bible. Translations you own can be added from Zefania XML.
- **Commentaries**: Matthew Henry, Calvin's Commentaries, Jamieson-Fausset-Brown, Barnes' Notes on the New Testament, and Spurgeon's Treasury of David on every Psalm.
- **Confessions**: the Westminster Confession and the Larger and Shorter Catechisms with their Scripture proofs and a topic index, with commentaries on them by Hodge, Shaw, and Vincent; the Apostles', Nicene, Athanasian, and Chalcedonian creeds; the Belgic Confession, the Heidelberg Catechism, and the Canons of Dort.
- **Original languages**: the Hebrew Old Testament (Leningrad Codex), five editions of the Greek New Testament (Textus Receptus, Byzantine, SBLGNT, Westcott–Hort, Tregelles) with a view of where they differ, the Septuagint and the Latin Vulgate. Strong's, Thayer's, Brown–Driver–Briggs, Abbott-Smith and Liddell–Scott–Jones; a word study for any word; search by grammar; a word-by-word interlinear with parsing. Double-click any word in the text for its entry.
- **Reference**: the International Standard Bible Encyclopedia (9,349 articles), Easton's and Smith's dictionaries merged into one (nearly 6,000 entries), and over 340,000 cross references.
- **Atlas**: 1,342 places of the biblical world, each with every verse that names it, and fourteen journeys from Abraham to Paul's voyage to Rome.
- **And**: two harmonies of the Gospels, five reading plans, the 1650 Scottish Metrical Psalter with playable tunes, and an offline neural voice that reads any chapter, commentary, or book aloud.

## What it does

**Reading and study.** Split the window into up to eight panes; drag them to dock, stack them as tabs, pick a quick arrangement, and save named workspaces. Linked panes follow each other: click a verse and the commentary, cross references, confession proofs, encyclopedia, and atlas beside it turn to that verse. Compare translations side by side, or one verse across every translation. Highlight in five named colours, underline, bookmark, and write notes on a verse, a highlight, or a chapter. Seven themes including sepia, true black, and high contrast, a dyslexia-friendly font, and reduced motion.

**Search.** One box covers Scripture, commentary, your notes and prayers, your books, the confessions, the encyclopedia, your sermons, and your illustrations. Search one translation or all of them, one commentary or all, narrow to a testament or book, list results by relevance or in Bible order, and match whole words.

**Sermons.** A manuscript editor whose points are its outline, with live passage blocks that render in the sermon's translation. A microphone button on every verse, commentary entry, confession section, lexicon entry, encyclopedia article, and book selection sends it into the open sermon with its source. A six-stage prep track, timed rehearsals, a full-screen preaching mode with a clock, slides generated from the manuscript with PowerPoint export, fill-in handouts, printing, and Markdown export. Sermon series can produce a reading plan for the congregation, and an illustrations file warns when a story has already been told in a series.

**Devotion.** A Today page with where you left off, today's plan, this Sunday's sermon, memory cards due, and people to pray for. Reading plans with catch-up tools and a builder for your own. A prayer journal in the ACTS pattern and a prayer list with a record of when each person was prayed for. Scripture and catechism memory with spaced repetition and three practice modes.

**Your own library.** Add your own EPUB, PDF, and MOBI books and your audio and video files. They are indexed for search and can be linked to passages, down to a moment in a recording.

**Your data.** Snapshots, automatic backups, export and import of the whole database, an integrity check, a copy to a folder synced by OneDrive or Dropbox, study stats with a reading heatmap, and a Trash that holds deleted notes for thirty days.

Every bundled work is in the public domain or used under a licence that asks only to be credited; Settings → About lists each source and its terms. Questions and corrections: sojourner@gentleking.org.

---

# For developers

A desktop application built with Tauri, Rust, and React/TypeScript. The application itself never makes a network request of its own accord; everything it needs is in `content.db` and the files beside it.

## The book library pack

The several hundred Puritan and Reformed works the app can carry do **not** ship in the installer. They are built into a separate resource pack the reader downloads from the releases page and installs from a file (Settings → Book library). That keeps the installer to the Bibles, commentaries and reference data — a third smaller than it was — and leaves the library to readers who want it.

```
npm run build:pack          # -> packs/Sojourner-Library-<version>.sjpack
```

A pack is a zip: `pack.json` (a SHA-256 per member), `library.db` (the books' text and its FTS index, prebuilt), and `books/*.epub`. Installing it verifies every checksum into a staging folder and only then swaps it into place, so a truncated download leaves the installed library untouched. The app ATTACHes `library.db` as a third schema beside `user.db` and `content.db`; with no pack installed nothing is attached and every query that reads a shipped book simply returns nothing. See `src-tauri/src/pack.rs`.

Nothing in the app downloads a pack. The reader fetches it themselves, which is what keeps the promise in Settings → About intact and lets a pack arrive on a USB stick.

To add books to the library the pack is built from:

```
npm run library:collect                      # from this machine's own app library
node tools/stage-library-books.mjs <folder>  # from a Shelf/Author/Book.epub tree
```

The second is dry by default and prints what it would add; pass `--apply` to copy. It skips books already shipped, books the app already carries as structured data (Calvin's and Matthew Henry's commentaries, the Westminster Standards, Easton's and Smith's dictionaries, the translations), and epubs with no usable text — page-image scans, and CCEL downloads whose chapter files came out empty.

## Reference data

Everything under `reference/` is committed and imported into `content.db` by `npm run build:content`. Most of it was prepared once and does not change.

Some of it is produced by scripts in `tools/`, which download from the open web at development time. They are one-time: run them only to pick up a new upstream release, then commit what they write.

```
node tools/extract-isbe.mjs      # -> reference/isbe/       (encyclopedia, public domain)
node tools/extract-atlas.mjs     # -> reference/atlas/      (places, CC BY 4.0)
node tools/extract-basemap.mjs   # -> src/features/atlas/basemap.json  (coastlines, public domain)
node tools/extract-borders.mjs   # -> src/features/atlas/borders.json  (region extents, CC BY 4.0)
```

Each accepts an optional path to already-downloaded source files, so they can be run offline. `extract-borders.mjs` fetches one small file per region and caches them under that path, so re-running it to retune the simplification costs nothing.

The rest of `tools/` is the same kind of one-time work, each script's header saying where its source came from:

| script | writes | from |
| --- | --- | --- |
| `extract-harmony.mjs` | `reference/harmony/robertson.json` | A. T. Robertson's *Harmony of the Gospels* (1922), Project Gutenberg |
| `extract-townsend-chronological.mjs`, `extract-townsend-nt.mjs`, `build-chronological-year.mjs` | `reference/reading_plans/chronological_year.json` | George Townsend's chronological arrangements (1821, 1826), divided into 365 days |
| `build-psalms-and-wisdom.mjs` | `reference/reading_plans/psalms_wisdom.json` | the app's own 150-day shape; no printed source |
| `build-psalter.mjs` (`npm run build:psalter`) | `reference/psalter/scottish_metrical_1650.json` | two scans of the 1650 Scottish Metrical Psalter, lineated by metre with `psalter-syllables.mjs` |
| `fetch-psalm-tunes.mjs` (`npm run fetch:tunes`), `import-psalm-tunes.mjs` (`npm run import:tunes`) | `reference/psalter/tunes.json` | the Open Hymnal Project's public-domain scores, and tune files you hold yourself |
| `fetch-voice-model.mjs` (`npm run fetch:voices`) | `models/` (ignored, ~170 MB) | the Kokoro-82M neural voice, Apache-2.0, bundled into the installer as `models/` |
| `repair-ccel-epub.mjs` | a book in `library/` | refills a CCEL epub whose chapter files came out empty |

The region borders are not lines anyone has surveyed. OpenBible publishes each region as a set of nested confidence contours -- "possibly reached this far" out at 10%, "certainly included this" in at 90% -- and the extractor keeps the widest and the middle one. The atlas draws them as a wash inside a dashed line for that reason: a crisp border would claim more than the evidence supports.

`reference/atlas/journeys.json` is written by hand rather than extracted -- no open dataset traces the routes. Each leg names a place and the verse that records it, and the importer resolves the two together, so a leg that names a place Scripture does not put there fails the build rather than drawing a wrong line.

The OpenBible.info data is CC BY 4.0. The credit for it in Settings → About is a condition of that licence.

## Brand assets and the splash screen

The logo is supplied as two renders on a near-white ground, kept in `brand/source/`. `tools/build-brand-assets.py` cuts them out of that ground and writes everything the app actually loads:

```
python tools/build-brand-assets.py          # needs `pip install pillow numpy`
npm run tauri -- icon brand/icon-source.png # then delete the ios/ and android/ sets it also writes
```

| written to | used by |
| --- | --- |
| `public/brand/sojourner-mark.png`, `-dark.png` | the sidebar mark, the About panel, the favicon |
| `public/brand/sojourner-lockup.png`, `-dark.png` | the splash screen |
| `brand/icon-source.png` | `tauri icon`, which fills `src-tauri/icons/` |

Everything comes in a pair, because the artwork is navy line-work around white pages: a drawing made for a light ground, on which the lines vanish and the pages glare. The `-dark` variant treats it as ink coverage and re-inks the navy pale, dropping the pages entirely. Which one is shown is a CSS rule — `.brand-mark` in `src/styles.css` for the app, `[data-splash-theme]` in `index.html` for the splash — so only the one in use is ever fetched.

The Windows icon is the exception: it puts the mark on an ivory tile rather than shipping it cut out, because Windows draws app icons against a dark taskbar by default and there is no second icon to switch to.

The splash screen is written into `index.html` itself — markup and styles — and timed by `public/splash.js`, loaded from the head. Neither is part of the Vite bundle on purpose: a splash that only appears once the bundle has been fetched, parsed and run misses the very wait it exists to cover. This one is on screen at the first paint, and `splash.js` runs early enough to choose light or dark from the saved theme before anything is drawn.

`app.windows[0].backgroundColor` in `tauri.conf.json` covers the one frame even that cannot reach — between the window opening and the first byte of the document. It is a single value where the splash has two, so it is set to the dark ground: a dark frame ahead of a light splash is a far gentler thing to open on than a white one ahead of a dark splash.

It stays up for at least ten seconds (`MIN_MS` in `splash.js`), longer if the app is not ready by then, and leaves when `AppShell` reports that the database has answered with the books and translations it needs. `MAX_MS` is the backstop for an app that never reports ready at all. The verses it shows are quoted from the KJV the app itself ships.

## Development

Needs Node, a Rust toolchain (`cargo` on PATH), and on Windows the NSIS bundler that `tauri build` installs on first use.

```
npm install
npm run build:content       # bibles/, commentaries/, reference/ -> content/content.db (a few minutes)
npm run fetch:voices        # the neural voice -> models/ (one download, ~170 MB)
npm run tauri dev
```

`content/` and `models/` are ignored by git and rebuilt by those two commands; `tauri dev` copies them beside the debug binary as the bundle's resources. The running dev instance holds `content.db` open, so stop it before a `cargo` build that rewrites it.

```
npm test                                          # the frontend (vitest)
cargo test --lib --manifest-path src-tauri/Cargo.toml   # the backend
```

## Build

```
npm run tauri build
```

This runs `build:content` first (see `build.beforeBuildCommand` in `src-tauri/tauri.conf.json`), then the frontend, then the release compile and the NSIS bundler. The whole run takes about twenty minutes and writes `src-tauri/target/release/bundle/nsis/Sojourner_<version>_x64-setup.exe`. The version is declared in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `package.json`; bump all three together.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Windows packaging

`npm run tauri build` produces an NSIS installer (per-user, no admin rights required, WebView2 runtime embedded so install works offline).

NSIS is the only target. Tauri's WiX MSI installs per-machine and asks for elevation, which does not match an app whose data lives in the user profile and which needs no elevation for anything; building both meant the two installers could not upgrade each other, so a reader who ran each in turn ended up with two copies, two Start Menu entries and two uninstall entries. (Their data was safe either way — same identifier, same app-data directory.)

**`productName` must not contain an apostrophe or a double quote.** Tauri's NSIS template pastes the product name into shortcut paths inside single-quoted `System::Call` arguments (`IsShortcutTarget`, `UnpinShortcut` and `SetShortcutTarget` in the `utils.nsh` the CLI generates), so a quote in the name ends the argument early and makensis aborts with `macro "NSISCOMCALL" requires 4 parameter(s), passed 8` — after the Rust release build has already run. "Sojourner's Study Companion" never produced an installer for exactly this reason. `src/tauriConf.test.ts` checks the name, so `npm test` fails long before `tauri build` would.

Two pieces of Windows packaging need something only the app's publisher can provide, so they're configured as far as possible here and documented rather than faked:

- **Code signing.** An unsigned `.exe`/installer triggers a Windows SmartScreen warning. Signing needs an Authenticode code-signing certificate (from a CA, or an EV cert on a hardware token) that only the publisher can obtain. Once you have one, either install it into the Windows certificate store and set `bundle.windows.certificateThumbprint` in `tauri.conf.json`, or sign out-of-band with `signtool` after `tauri build` completes. See the [Tauri Windows code-signing guide](https://v2.tauri.app/distribute/sign/windows/).
- **Auto-updater.** Tauri's updater plugin needs a signing keypair (`tauri signer generate`) whose private key must be kept secret and used to sign every release, plus a hosted JSON endpoint describing available updates and a place to host the signed artifacts. None of that infrastructure exists yet; adding `tauri-plugin-updater` with a placeholder key would make the app *appear* to check for updates while silently doing nothing, which is worse than not having it, so it's left out until real hosting is in place. See the [Tauri updater guide](https://v2.tauri.app/plugin/updater/). What does exist is a manual check: *Check for updates* on Settings → About asks the GitHub releases API for this repository's latest tag (`src-tauri/src/update.rs`), compares it with the running version, and offers the release page in the browser. It runs only when pressed, and it is the one network request the app can make.

Already in place: per-user install and an offline-capable WebView2 bootstrap (`tauri.conf.json`'s `bundle.windows`), `PRAGMA user_version`-based schema migrations (`src-tauri/src/db/mod.rs`), and crash logs for both backend panics and uncaught frontend errors, written to `<app data dir>/logs/` (see *Open logs folder* under Settings → Data & backups) with no data ever leaving the device.

**Portable build.** Tauri's bundler targets are installers; there's no first-class "extract and run" target. A portable folder is assembled by hand from a release build, so this is unaffected by which installer targets are configured:

```
npm run build                                                  # the frontend into dist/
cargo build --release --features custom-protocol --manifest-path src-tauri/Cargo.toml
```

then copy `src-tauri/target/release/tauri-app.exe` (rename it to taste), `content/content.db`, `src-tauri/resources/kjv-g2p.tab`, and the `models/` folder into one folder. The executable looks for them beside itself, which is where `bundle.resources` maps them in an installed copy, so the same lookup serves both.

**`--features custom-protocol` is not optional.** It is what makes a built app serve the frontend from inside itself; without it the window opens on "localhost refused to connect", since the binary still expects the dev server. `tauri build` passes it for you — but only if the feature is declared in `src-tauri/Cargo.toml`, which it now is.

Two things to know before handing the folder to someone else. The executable is not code-signed, so Windows SmartScreen warns on first run on each new machine ("More info" → "Run anyway"). And the app draws its window with the Microsoft Edge WebView2 runtime: Windows 11 always has it and most Windows 10 machines do, but where it is missing the app will not start, and the free Evergreen Bootstrapper (https://go.microsoft.com/fwlink/p/?LinkId=2124703) installs it. Anything written while it runs lands in `%APPDATA%\com.sojourner.study` on *that* machine, not on the stick.
