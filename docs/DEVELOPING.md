# Developing Sojourner

How Sojourner is built, tested and packaged. What it is and how to get it are in the [README](../README.md); cutting a release is in [.github/RELEASING.md](../.github/RELEASING.md); the names and layout rules a new feature should keep to are in [house-rules.md](house-rules.md).

Paths below are from the repository's root.

A desktop application built with Tauri, Rust, and React/TypeScript. The application itself never makes a network request of its own accord; everything it needs is in `content.db` and the files beside it.

## The book library pack

The several hundred Puritan and Reformed works the app can carry do **not** ship in the installer. They are built into a separate resource pack the reader downloads from the releases page and installs from a file (Settings → Book library). That keeps the installer to the Bibles, commentaries and reference data — a third smaller than it was — and leaves the library to readers who want it.

```
npm run build:pack                      # -> packs/Sojourner-Library-<version>.sjpack
node tools/fetch-shelves.mjs            # the other shelves' books, from CCEL and Project Gutenberg
npm run build:pack -- --shelf fathers   # -> packs/Church-Fathers-<version>.sjpack (also ancient, nineteenth)
```

Each shelf is listed in `library/shelves/<id>.json` with every book's source and terms; the books share the one `library/` folder, and the build refuses a book listed on two shelves. Installed, each shelf is attached as its own schema (`lib_<id>`) and searched with the rest. Every pack also carries `library_citations`: each chapter-and-verse reference in its books, as printed, which the app counts beside each verse and lists in the *Cited in your library* pane.

A pack is a zip: `pack.json` (a SHA-256 per member), `library.db` (the books' text and its FTS index, prebuilt), and `books/*.epub`. Installing it verifies every checksum into a staging folder and only then swaps it into place, so a truncated download leaves the installed library untouched. The app ATTACHes `library.db` as a third schema beside `user.db` and `content.db`; with no pack installed nothing is attached and every query that reads a shipped book simply returns nothing. See `src-tauri/src/pack.rs`.

Nothing in the app downloads a pack. The reader fetches it themselves, which is what keeps the promise in Settings → About intact and lets a pack arrive on a USB stick.

Each shipped book's `subject` ("Sermons", "Theology", "Ante-Nicene Fathers") sits beside it in `library/manifest.json` and `library/shelves/*.json`. `build:content` copies them into content.db's `library_catalog`, not into the packs, so a reader gets them with any pack version and they can be corrected in any app update; the build fails on a shipped book with no subject.

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
| `build-psalter.mjs` (`npm run build:psalter`) | `reference/psalter/scottish_metrical_1650.json` | two scans of the 1650 Scottish Metrical Psalter, lineated by metre with `psalter-syllables.mjs` and the syllable lexicon below, and checked against the Free Church of Scotland's plain-text Psalter; see `reference/psalter/SOURCES.md` |
| `psalter-lexicon.mjs` | `reference/psalter/syllables.json` | the Moby Hyphenation List (public domain) and the CMU Pronouncing Dictionary's syllable counts (BSD); see `reference/psalter/SOURCES.md` |
| `fetch-psalm-tunes.mjs` (`npm run fetch:tunes`), `import-psalm-tunes.mjs` (`npm run import:tunes`) | `reference/psalter/tunes.json` | the Open Hymnal Project's public-domain scores, and tune files you hold yourself |
| `fetch-voice-model.mjs` (`npm run fetch:voices`) | `models/` (ignored, ~170 MB) | the Kokoro-82M neural voice, Apache-2.0, bundled into the installer as `models/` |
| `repair-ccel-epub.mjs` | a book in `library/` | refills a CCEL epub whose chapter files came out empty |
| `fetch-translations.mjs` | `bibles/usfm/<CODE>/` | the BSB, LSV, ULT and UST, the Septuagint and the Vulgate in USFM, each with a `source.json` of where it came from and how its numbering is adjusted |
| `fetch-shelves.mjs` | `library/` and `library/shelves/*.json` | the Church Fathers, ancient literature and nineteenth-century shelves, from CCEL and Project Gutenberg |
| `extract-schaff-confessions.py` | `reference/confessions/` (all but Chalcedon) | Schaff's *Creeds of Christendom* II and III, from the nineteenth-century shelf's epubs in `library/` |
| `extract-dort-rejections.py` | `tools/dort-rejections.json` | the Canons of Dort's Rejection of Errors in Thomas Scott's translation (1818), voted between the Internet Archive's OCR of the 1831 and 1856 printings and proofread against Schaff's Latin |
| `extract-timeline.mjs` | `reference/timeline/events.json`, `chapter_years.json` | the Theographic Bible Metadata (CC BY-SA 4.0) at a pinned commit; see `reference/timeline/SOURCES.md` |
| `build-webster1828.py` | `reference/webster1828/` | Webster's 1828 dictionary (public domain) from DataWar's MIT-licensed dump at a pinned commit, its licence kept beside the data; see `reference/webster1828/SOURCES.md` |

The lexicons (`reference/lexicons/`), the Hebrew and Greek editions (`reference/morphology/`) and the Factbook's names (`reference/factbook/`) are STEPBible, OpenScriptures and Tyndale House data under CC BY and CC BY-SA. `reference/lexicons/SOURCES.md` and `reference/factbook/SOURCES.md` say where each file came from; the editions are the STEPBible TAHOT and TAGNT files and MorphGNT's SBLGNT, as their file names say, and Settings → About credits every one. The timeline's eras, its fifteen added events and its hand-mapped names are the app's own arranging, kept apart from the source data in `eras.json`, `additions.json` and `overrides.json`, and the importer fails the build on any person or place it cannot resolve. The 296 church-history events in `church_history.json` are written for Sojourner too, but every date in them is a source's: each event quotes the passage that dates it, from Schaff's *History of the Christian Church* and *Creeds of Christendom*, the Nicene and Post-Nicene Fathers and the New Schaff-Herzog Encyclopedia, and for the six events after 1914, two references that agree. Each event's id is permanent, since the app names an event by it; `reference/timeline/SOURCES.md` lists the sources and the rule for what is kept.

The plain-English parsing is `src-tauri/src/morph.rs` decoding each word's morphology code, with a glossary of about 150 terms written for the app (`src/features/lexicon/parsingGlossary.json`) and checked against STEPBible's Greek and Hebrew code tables (CC BY 4.0); `reference/morphology/SOURCES.md` says how.

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

It stays up for at least three seconds (`MIN_MS` in `splash.js`), longer if the app is not ready by then, and leaves when `AppShell` reports that the database has answered with the books and translations it needs. `MAX_MS` is the backstop for an app that never reports ready at all. The verses it shows are quoted from the KJV the app itself ships.

## Development

Needs Node, a Rust toolchain (`cargo` on PATH), and on Windows the NSIS bundler that `tauri build` installs on first use.

**Use Rust 1.99.1 for now, not 1.100.** Rust 1.100 (12 November 2026) changed the layout of its build directory, and the voice's ONNX runtime (`ort-sys` 2.0.0-rc.13, through `kokoro-en`) fails in its build script on it. `rustup override set 1.99.1` in this folder does it. The workflows are pinned the same way; unpin both once `ort` has a release that builds on the newer Rust. The web build has no voice and is not affected.

```
npm install
npm run build:content       # bibles/, commentaries/, reference/ -> content/content.db (a few minutes)
npm run fetch:voices        # the neural voice -> models/ (one download, ~170 MB)
npm run tauri dev
```

`content/` and `models/` are ignored by git and rebuilt by those two commands; `tauri dev` copies them beside the debug binary as the bundle's resources. The running dev instance holds `content.db` open, so stop it before a `cargo` build that rewrites it.

```
npm test                                          # the frontend (vitest)
npx tsc --noEmit                                  # its types
npm run lint                                      # ESLint (eslint.config.js)
cargo test --lib --manifest-path src-tauri/Cargo.toml -p tauri-app -p sojourner-core   # the backend
```

All four run on every push and pull request (`.github/workflows/test.yml`).

Before a release, the checks against real data: the operator search on the KJV, the word study, migrating a copy of a real user.db, every pack in `packs/` for this version installing and attaching side by side, and the upgrade from the first library pack to the shelves (which needs `packs/Sojourner-Library-0.1.0.sjpack`):

```
cargo test --release --lib --manifest-path src-tauri/Cargo.toml -- --ignored
```

### The web version

Needs the desktop prerequisites plus the `wasm32-unknown-unknown` Rust target, LLVM's `clang` and `llvm-ar`, and `wasm-bindgen-cli` at the version pinned in `src-tauri/crates/sojourner-web/Cargo.toml`.

```
npm run build:wasm            # the Rust backend as WebAssembly
npm run build:content:web     # content/web/: content.db in pieces, manifest.json (uploaded to R2 by hand: npm run upload:content:web)
npm run dev:web               # port 1420; reads the books from src/web/content.json's address, or VITE_CONTENT_BASE
npm run build:web             # dist-web/, with the service worker and headers
```

Cloudflare Web Analytics is added to the web app's page by Cloudflare as it serves it (the automatic setup in the dashboard), so no tag or token is in this repository. The app's security policy names the two hosts it needs (`tools/vite-web-pwa.ts`), and Settings → About tells the reader. The desktop app has none.

`.github/workflows/web.yml` builds the app and deploys it to Cloudflare Pages on pushes to `pwa` and `master`; it does not rebuild the content, which is uploaded separately and pinned in `src/web/content.json` (shelves and maps in `shelves.json` and `maps.json`).

## Build

```
npm run tauri build
```

This runs `build:content` first (see `build.beforeBuildCommand` in `src-tauri/tauri.conf.json`), then the frontend, then the release compile and the NSIS bundler. The whole run takes about twenty minutes and writes `src-tauri/target/release/bundle/nsis/Sojourner_<version>_x64-setup.exe`. The version is declared in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `package.json`; bump all three together.

## Releases

Release installers are built by GitHub Actions (`.github/workflows/release.yml`) rather than on a developer's own machine, so what readers download is built from the source in this repository; 0.3.4 is the first release made this way. `.github/RELEASING.md` gives the steps, from the version bump to the draft release; the local `npm run tauri build` above is for trying an installer before that.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Windows packaging

`npm run tauri build` produces an NSIS installer (per-user, no admin rights required, WebView2 runtime embedded so install works offline).

NSIS is the only target. Tauri's WiX MSI installs per-machine and asks for elevation, which does not match an app whose data lives in the user profile and which needs no elevation for anything; building both meant the two installers could not upgrade each other, so a reader who ran each in turn ended up with two copies, two Start Menu entries and two uninstall entries. (Their data was safe either way — same identifier, same app-data directory.)

**`productName` must not contain an apostrophe or a double quote.** Tauri's NSIS template pastes the product name into shortcut paths inside single-quoted `System::Call` arguments (`IsShortcutTarget`, `UnpinShortcut` and `SetShortcutTarget` in the `utils.nsh` the CLI generates), so a quote in the name ends the argument early and makensis aborts with `macro "NSISCOMCALL" requires 4 parameter(s), passed 8` — after the Rust release build has already run. "Sojourner's Study Companion" never produced an installer for exactly this reason. `src/tauriConf.test.ts` checks the name, so `npm test` fails long before `tauri build` would.

Two pieces of Windows packaging depend on something outside this repository:

- **Code signing.** An unsigned installer triggers a Windows SmartScreen warning. Release installers are to be signed with a Certum SimplySign certificate; the signing is not wired up yet, so the draft release carries the unsigned installer. (The *Sign with SignPath* job still in `.github/workflows/release.yml` is from an earlier plan and stays skipped, since its variables are not set.) A certificate thumbprint (`bundle.windows.certificateThumbprint`) or `signtool` only matters for signing a local build by hand; see the [Tauri Windows code-signing guide](https://v2.tauri.app/distribute/sign/windows/).
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
