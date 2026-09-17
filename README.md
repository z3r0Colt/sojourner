# Sojourner

*Bible Study Companion*

A desktop Bible study application built with Tauri, Rust, and React/TypeScript. It bundles multiple public-domain Bible translations, classic commentaries, Strong's lexicon data, a Bible dictionary and encyclopedia, an atlas of the biblical world, cross-references, and the Westminster Standards for offline study, reading, and note-taking.

The application itself never makes a network request. Everything it needs is in `content.db` and the files beside it.

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

```
npm install
npm run tauri dev
```

## Build

```
npm run tauri build
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Windows packaging

`npm run tauri build` produces an NSIS installer (per-user, no admin rights required, WebView2 runtime embedded so install works offline).

NSIS is the only target. Tauri's WiX MSI installs per-machine and asks for elevation, which does not match an app whose data lives in the user profile and which needs no elevation for anything; building both meant the two installers could not upgrade each other, so a reader who ran each in turn ended up with two copies, two Start Menu entries and two uninstall entries. (Their data was safe either way — same identifier, same app-data directory.)

Two pieces of Windows packaging need something only the app's publisher can provide, so they're configured as far as possible here and documented rather than faked:

- **Code signing.** An unsigned `.exe`/installer triggers a Windows SmartScreen warning. Signing needs an Authenticode code-signing certificate (from a CA, or an EV cert on a hardware token) that only the publisher can obtain. Once you have one, either install it into the Windows certificate store and set `bundle.windows.certificateThumbprint` in `tauri.conf.json`, or sign out-of-band with `signtool` after `tauri build` completes. See the [Tauri Windows code-signing guide](https://v2.tauri.app/distribute/sign/windows/).
- **Auto-updater.** Tauri's updater plugin needs a signing keypair (`tauri signer generate`) whose private key must be kept secret and used to sign every release, plus a hosted JSON endpoint describing available updates and a place to host the signed artifacts. None of that infrastructure exists yet; adding `tauri-plugin-updater` with a placeholder key would make the app *appear* to check for updates while silently doing nothing, which is worse than not having it, so it's left out until real hosting is in place. See the [Tauri updater guide](https://v2.tauri.app/plugin/updater/).

Already in place: per-user install and an offline-capable WebView2 bootstrap (`tauri.conf.json`'s `bundle.windows`), `PRAGMA user_version`-based schema migrations (`src-tauri/src/db/mod.rs`), and crash logs for both backend panics and uncaught frontend errors, written to `<app data dir>/logs/` (see "Open Logs Folder" in Library settings) with no data ever leaving the device.

**Portable build.** Tauri's bundler targets are installers; there's no first-class "extract and run" target. A portable folder is assembled by hand from a release build, so this is unaffected by which installer targets are configured:

```
npm run build                                                  # the frontend into dist/
cargo build --release --features custom-protocol --manifest-path src-tauri/Cargo.toml
```

then copy `src-tauri/target/release/tauri-app.exe` (rename it to taste) and `content/content.db` into one folder. The executable looks for `content.db` beside itself, which is where `bundle.resources` maps it in an installed copy, so the same lookup serves both.

**`--features custom-protocol` is not optional.** It is what makes a built app serve the frontend from inside itself; without it the window opens on "localhost refused to connect", since the binary still expects the dev server. `tauri build` passes it for you — but only if the feature is declared in `src-tauri/Cargo.toml`, which it now is.

Two things to know before handing the folder to someone else. The executable is not code-signed, so Windows SmartScreen warns on first run on each new machine ("More info" → "Run anyway"). And the app draws its window with the Microsoft Edge WebView2 runtime: Windows 11 always has it and most Windows 10 machines do, but where it is missing the app will not start, and the free Evergreen Bootstrapper (https://go.microsoft.com/fwlink/p/?LinkId=2124703) installs it. Anything written while it runs lands in `%APPDATA%\com.sojourner.study` on *that* machine, not on the stick.
