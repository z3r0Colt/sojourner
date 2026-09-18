# Pre-release review — Sojourner's Study Companion

Reviewed at commit `ebc5503`, branch detached at `main`. Tauri 2.11.5 (Rust crate) /
`@tauri-apps/cli` 2.11.4, React 19, TypeScript 6.0.3, rusqlite 0.31 (bundled SQLite).
Review only — no tracked file was changed.

## What this app is, and what can actually go wrong with it

A single-window offline Bible study and sermon-preparation desktop app. It ships a
967 MB prebuilt `content.db` (13 Bible translations, 5 commentary sets with 247,880
entries, 387,115 verse rows, Strong's, ISBE, Westminster standards, atlas,
cross-references), a 144 MB library of 198 Reformed/Puritan e-books, and a 170 MB
Kokoro neural TTS model. User data — notes, chapter notes, highlights, bookmarks,
prayer journal and prayer list, memory verses, reading plans and progress, sermons,
series, illustrations, search history, settings, and an imported-resource catalogue —
lives in one `user.db` under `%APPDATA%\com.sojourner.study`, alongside `backups/`,
`logs/`, `resources/` and `imports/`. Plugins: `opener`, `dialog` (used only from
Rust), `window-state`. **The app makes no network calls of its own at runtime** — I
looked for them and found none; the only downloads are build-time tools
(`tools/fetch-voice-model.mjs`, `tools/fetch-psalm-tunes.mjs`). `withGlobalTauri` is
off and nothing needs it.

Against the four things that realistically threaten an app like this:

- **Script in the webview.** Genuinely well defended, and deliberately so. The CSP is
  tight (`script-src 'self'`, `object-src 'none'`, no `unsafe-eval`; `'unsafe-inline'`
  appears only under `style-src`, which Tailwind and the EPUB stylesheet injection
  require). Every stored-HTML display point goes through `src/lib/sanitizeHtml.ts`, an
  allowlist sanitizer that parses inertly via `DOMParser` — including the note path
  (`noteLinks.ts:74`), which is the one that matters because a `user.db` can be handed
  between people. Every one of the seven FTS snippet producers escapes through
  `escape_snippet` before the frontend writes it with `dangerouslySetInnerHTML`; I
  checked each. EPUBs render with `allowScriptedContent: false`. I found no injection
  path.
- **A malicious file the user opens.** This is the live surface. PDF extraction already
  wraps `catch_unwind` with a test that proves it. But the EPUB reader's XML parser
  (`@xmldom/xmldom` 0.7.13) carries eight unfixed advisories — see H5.
- **Loss or corruption of user data.** The strongest part of the codebase. `VACUUM INTO`
  for snapshots, staged import applied before anything opens the file, a pre-import
  safety backup that provably captures the WAL, a schema-version refusal for databases
  from newer builds, soft delete with a 30-day sweep. 78 Rust tests, and they test the
  paths that matter rather than the easy ones. My one real complaint here is H2: those
  carefully written refusals are thrown into a panic nobody ever sees.
- **A broken install.** This is where it failed. `tauri build` did not produce an
  installer at all (C1 — resolved 2026-09-18; the cause was an apostrophe in the old
  product name, not the toolchain).

Two findings below are about copyright rather than code, but they stop a release just
as hard.

---

## Fix these three first

1. **C1 — `tauri build` fails; there is no installer.** The NSIS step aborts. Nothing
   can ship until this produces a file. *Resolved 2026-09-18: the installer builds,
   installs, runs and uninstalls — see the section for what actually broke.*
2. **C2 — Three copyrighted Bible translations are bundled into the installer.** NASB
   1995, NKJV 1982 and NLT 1996 are shipping in full with no licence. This is the one
   finding that carries legal consequence.
3. **H1 — One `Mutex<Connection>` for the whole app, so any slow command freezes every
   other one.** Measured: a chapter load that normally takes 0.1 ms waits **3,296 ms**
   behind the Settings integrity check and **670 ms** behind a search.

---

# Critical

### C1 — `tauri build` produces no installer; the NSIS step aborts — resolved 2026-09-18

**Evidence — tool output.** `npm run tauri -- build --config <override skipping only the
967 MB content.db rebuild>`:

```
     Running makensis to produce ...\bundle\nsis\Sojourner's Study Companion_0.1.0_x64-setup.exe
!insertmacro: macro "NSISCOMCALL" requires 4 parameter(s), passed 8!
Error in macro IsShortcutTarget on macroline 11
Error in script "...\target\release\nsis\x64\installer.nsi" on line 1246 -- aborting creation process
failed to bundle project: `Failed to bundle app with makensis`
       Error failed to bundle project: `Failed to bundle app with makensis`
```

Everything up to bundling succeeded: the frontend built (`✓ 2257 modules transformed`,
`✓ built in 6.30s`) and the Rust release build succeeded
(`Finished \`release\` profile [optimized] target(s) in 4m 46s`, `tauri-app.exe` 77.38 MB).
`target\release\bundle\nsis\` is created and left empty.

**What it actually was (found 2026-09-18).** The first draft of this section blamed the
`GetPath` call and the NSIS 3.11 toolchain. Both were wrong. Counting from the
`!macro IsShortcutTarget` header, "macroline 11" is the line above `GetPath`, in
`src-tauri/target/release/nsis/x64/utils.nsh`:

```
      ${IPersistFile::Load} $1 '("${shortcut}", ${STGM_READ})'
```

`${shortcut}` is the Start Menu `.lnk` path, which contains `${PRODUCTNAME}` — and the
product name at the reviewed commit was `Sojourner's Study Companion`. The apostrophe
closes the single-quoted argument early, and what follows tokenises into exactly the 8
parameters the error counts. Reproduced against the cached makensis 3.11 with the CLI's own
generated `utils.nsh`: the name with the apostrophe fails with this exact message; the
name `Sojourner` compiles to an installer. `UnpinShortcut` and `SetShortcutTarget` quote
the same way and would have failed next.

Neither of the remedies first proposed here could have worked: `@tauri-apps/cli` 2.11.4 is
the latest release (there is no 2.11.5), upstream `dev` still ships this macro and still
pins NSIS 3.11, and NSIS 3.10 and 3.11 define `IShellLink::GetPath` and `NSISCOMCALL`
identically.

**Fix.** Commit `8f28bc0` renamed the product to `Sojourner` for its own reasons and took
the trigger with it. Two guards keep it from coming back: `src/tauriConf.test.ts` fails
`npm test` if `productName` contains a quote, and README "Windows packaging" says why.

**Verified 2026-09-18** with the unmodified `npm run tauri build` — content database
rebuild (64 sources, none failed), frontend, Rust release, NSIS — producing
`Sojourner_0.1.0_x64-setup.exe` (538 MB). Installed silently (`/S`) as the current user
with no elevation prompt into `%LOCALAPPDATA%\Sojourner`; Start Menu and desktop shortcuts
and the HKCU uninstall entry were written; the installed app opened the bundled
`content.db` and rendered the saved workspace, commentary text included, about 12 s after
launch, with no new file in `logs/`; it closed with exit code 0; uninstall removed the
shortcuts and the registry entry. So `resources`, `nsis.installMode: "currentUser"` and
`webviewInstallMode: offlineInstaller` have now all been exercised. Two things noticed on
the way, neither of which blocks a release:

- The uninstaller left `content.db-wal` and `content.db-shm` behind, because the app
  creates them beside the shipped database on first open (it is writable on purpose:
  "Add file" imports a reader's own Bibles into it), so `%LOCALAPPDATA%\Sojourner`
  survived uninstall holding two empty files. *Fixed the same day:*
  `src-tauri/nsis/hooks.nsh` deletes the pair after uninstall and removes the folder, and
  deletes a stale pair before an upgrade lands a new `content.db`, so an old write-ahead
  log is never replayed onto the new file. Verified: after the upgrade the pair is gone,
  after uninstall the folder is gone.
- `build_content_db.exe` (26 MB) was bundled into the installer next to `tauri-app.exe`.
  The CLI's `get_binaries` scans `src-tauri/src/bin/` and ships what it finds -- and,
  through an upstream bug (`path.ends_with("")` is true for every path), exactly the
  first one, which is why the other four tools were left out. *Fixed the same day:* the
  tools are `[[bin]]` targets behind a `tools` feature that `tauri build` never enables;
  the installer dropped from 538 MB to 532 MB and its `installer.nsi` lists no binary but
  the app.
- An upgrade overwrites files in place and does not run the previous uninstaller, so a
  file the old version shipped and the new one does not is left where it was. *Handled:*
  the pre-install hook names each such file as it is dropped (so far only the build tool
  above), and an upgrade from the pre-fix installer was seen to remove it.
- "Add file" imports go into the installed `content.db`, which an upgrade replaces. The
  source files stay in `%APPDATA%\com.sojourner.study\imports\`. *Fixed the same day:*
  `commands::library::rescan_imports_after_upgrade` runs at launch off the main thread,
  and when content.db's size or timestamp differs from the stamp kept in user.db it
  re-imports that folder (the importers skip files they already hold by checksum).
  Verified on an empty profile: an imported Bible came back after a simulated upgrade,
  and a launch with nothing changed touched nothing.

Upgrade over a previous version was exercised on 2026-09-18 (the pre-fix installer, then
this one over it: one uninstall entry, shortcuts kept, the app ran and closed cleanly).
First run on a clean machine was simulated by moving the app-data folder and the WebView2
profile aside: a 4 KB user.db was created, the ten translations were listed, and the app
opened and closed cleanly. A genuinely separate machine is the one thing left.

Confidence: **sure** (reproduced both ways; the installer was built, installed, run and
removed on this machine).

---

### C2 — NASB 1995, NKJV 1982 and NLT 1996 ship in the installer without a licence

`src-tauri/tauri.conf.json:41` bundles the database built from `bibles/`:

```json
      "../content/content.db": "content.db",
```

and `bibles/` contains, as full verified text:

```
New American Standard Bible (1995).xml                  4.8 MB
New King James Version (1982).xml                       4.8 MB
New Living Translation (1996).xml                       4.8 MB
```

I checked the contents rather than trusting the file names. `bibles/New American
Standard Bible (1995).xml:2` declares `biblename="ENGLISHNAU"` (NASB Updated) and the
verse text is the genuine NASB 1995; NKJV and NLT likewise match their published
wording.

All three are in copyright and none permits free redistribution of the full text inside
an application: NASB 1995 is the Lockman Foundation's, NKJV 1982 is Thomas
Nelson/HarperCollins', NLT 1996 is Tyndale House Publishers'. Each requires a
negotiated licence, and each has a hard limit on how much text may be quoted without
one — limits that a complete bundled Bible is far past. `README.md` documents the CC BY
obligation for the OpenBible.info data and says nothing about these three.

The other ten translations are fine: ASV 1901, Darby 1890, Douay-Rheims 1899, Geneva
1599, KJV 1769, Tyndale, Webster 1833, World English Bible, Wycliffe, Young's Literal
1898 are all public domain. The OpenDyslexic fonts carry `src/assets/fonts/OFL.txt`
(SIL Open Font License), which permits bundling.

**Smallest change:** remove the three files and rebuild the content database —

```
bibles/New American Standard Bible (1995).xml   → delete
bibles/New King James Version (1982).xml        → delete
bibles/New Living Translation (1996).xml        → delete
```

then `npm run build:content`. Nothing in the code special-cases them; `import::scan_files`
discovers whatever is in the folder, and `remove_translation` already exists for
databases that have them. Ten translations remain, which is a lot of translations.

The alternative is licensing all three before first install, which is slow and, for NASB
and NLT, usually expensive.

Confidence: **sure** on what is bundled and that it is copyrighted. I am not your
lawyer; the remedy is a decision, the fact is not.

---

# High

### H1 — One shared `Mutex<Connection>`: a slow command freezes every other command

`src-tauri/src/db/mod.rs:8`:

```rust
pub struct DbState(pub Mutex<Connection>);
```

Every command in the app reaches the database through `DbState::conn()`
(`db/mod.rs:23`), and most commands are **synchronous**, which in Tauri 2 means they run
on the main thread. The long-running commands were correctly moved to `spawn_blocking`
— but they take the *same single lock*, and hold it for their whole duration. Moving
work off the main thread does not help when the main thread then blocks on the lock that
work is holding.

**Evidence — measured**, with the real 967 MB `content.db` attached, one
`Mutex<Connection>` shared between two threads exactly as `DbState` is:

```
baseline get_chapter John 3 (36 verses) = 0.1 ms
while quick_check (Settings button) ran (3357 ms): get_chapter waited 3296 ms on the lock
while search "the" ran (730 ms):                   get_chapter waited  670 ms on the lock
```

On a cold cache `quick_check` measured **11,236 ms**. That whole time the window is
frozen: not "a spinner in one pane" — every chapter load, note list, highlight fetch,
reading-position save and manuscript autosave is stopped dead.

And `quick_check` is not the worst case. `commands/resources.rs:88-90`:

```rust
        let db = app.state::<DbState>();
        let conn = db.conn();
        Ok(resources::import_folder(&conn, &dest_dir, &folder_path, &[])?)
```

takes the lock **before** a folder walk that copies every book and extracts the text of
each. The function's own doc comment says "On a personal library that is minutes of
work." The app is unusable for those minutes. `add_resource` in the same file gets this
right — it copies and extracts first and takes the lock at line 58-59, after — so the
correct shape is already present two functions above.

This violates the hard target outright: nothing should freeze the window at all.

**Smallest change:** stop sharing one connection between the fast path and the slow one.
Give the long-running commands their own connection instead of the shared handle. In
`db/mod.rs`, add beside `open`:

```rust
/// A second connection to the same two files, for work that takes real time.
/// SQLite in WAL mode supports concurrent readers, so a search or an integrity
/// check on this one never blocks the chapter the reader just clicked.
pub fn open_secondary(app_data_dir: &Path, content_db_path: &Path) -> anyhow::Result<Connection> {
    open(app_data_dir, content_db_path)
}
```

then have `commands::search::search`, `commands::backup::quick_check` and
`commands::resources::bulk_import_resources` use it rather than `app.state::<DbState>()`.
(`bulk_import_resources` additionally needs its writes batched, since two writers do
serialize — but it stops holding the *read* lock for the whole walk.)

If a second connection is unwanted, the narrower fix for `bulk_import_resources` alone is
to move the lock acquisition inside `import_folder`'s per-file loop, matching
`add_resource`.

Confidence: **sure** (measured, with the numbers above).

---

### H2 — Every startup failure is a silent exit with no window and no message

`src-tauri/src/lib.rs:97`, `:149`, `:151`:

```rust
                .expect("could not resolve app data dir");
```
```rust
            backup::apply_pending_import(&app_data_dir).expect("failed to apply a staged import/restore");
```
```rust
            let conn = db::open(&app_data_dir, &content_db_path).expect("failed to open database");
```

`main.rs:2` sets `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`, so
in release there is no console. A panic in `setup` unwinds out through
`.run(...).expect("error while running tauri application")` and the process exits. The
user double-clicks the icon and **nothing happens at all** — no window, no dialog, no
error.

What makes this more than theoretical is that the codebase deliberately produces good
messages here and then throws them away. `db/mod.rs:178-183` refuses a database from a
newer build with a message written to be read by a person:

```rust
        "this database was written by a newer version of the app \
         (schema {current}, this build knows {})",
```

There is a test asserting "the refusal must say why, not just fail"
(`db/mod.rs:587`). That message reaches `db::open`'s `Err`, hits `.expect` at
`lib.rs:151`, and is seen by no one. The exact scenario is a reader restoring a backup
taken on a machine running a later version — the app simply stops launching.

The crash log is written (the panic hook is installed at `lib.rs:148`, before the two
`expect`s that follow — good), but the user has no way to know a log exists.

**Smallest change:** show the message before dying. In `lib.rs`, replace the three
`expect`s with a helper that reports and then exits:

```rust
fn fatal(app: &tauri::AppHandle, what: &str, e: impl std::fmt::Display) -> ! {
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
    app.dialog()
        .message(format!("{what}\n\n{e}"))
        .title("Sojourner's Study Companion could not start")
        .kind(MessageDialogKind::Error)
        .blocking_show();
    std::process::exit(1);
}
```

and call it, e.g. at `lib.rs:151`:

```rust
            let conn = match db::open(&app_data_dir, &content_db_path) {
                Ok(conn) => conn,
                Err(e) => fatal(&handle, "Your study database could not be opened.", e),
            };
```

`tauri_plugin_dialog` is already a dependency and already initialised (`lib.rs:58`), so
this needs nothing new — and no capability change, since the dialog is raised from Rust.

Confidence: **sure** on the mechanism and the code path. I did not stage a
newer-schema database against an installed build to watch the window not appear, because
there is no installed build (C1).

---

### H3 — Search misses the 200 ms target badly on the first search of every session

**Evidence — measured** against the shipped 967 MB `content.db` (13 translations,
5 commentary sources, 247,880 commentary entries), `limit = 50`, exactly the calls
`commands::search::search` makes:

Cold (first search after launch — the common case):

```
search      grace: verses   95 ms, commentary 1167 ms  -- total 1263 ms
search       love: verses   76 ms, commentary  624 ms  -- total  701 ms
search        the: verses  389 ms, commentary 3046 ms  -- total 3436 ms
search          a: verses  383 ms, commentary  643 ms  -- total 1025 ms
search  righteous: verses    7 ms, commentary   31 ms  -- total   39 ms
```

Warm (repeat in the same session):

```
   grace run2: verses   3 ms, commentary  43 ms =  46 ms
    love run2: verses   9 ms, commentary  39 ms =  47 ms
     the run2: verses 320 ms, commentary 399 ms = 719 ms
```

So: a distinctive word is fine once warm (46 ms), but **the first search of a session
costs 0.7–3.4 seconds**, and a common short word stays at ~0.7–0.9 s no matter how warm
the cache is. The target is 200 ms after the user stops typing. The input *is* debounced
(250 ms, `SearchOverlay.tsx:59-60`) and the command *is* async, so the window does not
freeze on its own account — but see H1: this query holds the global lock for its whole
duration, which is how a 670 ms freeze gets into the reading pane.

**On the fix — I tested the obvious one and it is wrong.** `db/queries/resources.rs:201-214`
documents exactly this class of bug and solves it with a two-pass rank-then-quote, so I
measured that shape against the commentary index:

```
one-pass (today) vs two-pass, prefix terms
       grace: one-pass =  36 ms   two-pass =   64 ms
         the: one-pass = 521 ms   two-pass = 3132 ms
```

Two-pass is **five times worse** here. `resources_fts` documents are whole books, where
`snippet()` dominates; `commentary_fts` documents are single entries, where it does not.
Do not port that pattern. Prefix vs exact matching is also not the driver
(`"the"*` 411 ms vs `"the"` 275 ms).

The cost is `ORDER BY bm25(commentary_fts)` scoring every matching row over a
quarter-million entries, plus cold page-in from a 967 MB file.

**Smallest changes, in order of value:**

1. Warm the indexes at startup so the first search is not the cold one. In `lib.rs`
   `setup`, after the connection is opened, on a background thread:

   ```rust
   // The first search of a session paid 1.3-3.4 s to page these in. Do it now,
   // off the main thread, while the reader is still finding their place.
   let warm = app.handle().clone();
   std::thread::spawn(move || {
       let db = warm.state::<DbState>();
       let conn = db.conn();
       let _ = db::queries::search::search_commentary(&conn, "the", &[1], 1);
   });
   ```

   This must land **after** H1, or the warm-up itself becomes the freeze.

2. Show the reader that a search is running. At 700 ms with no indicator the app reads
   as broken; at 700 ms with one it reads as working.

Measured numbers, one machine, warm and cold as labelled. I did not measure on a modest
laptop — this one has an NVMe drive, so **cold figures on a spinning or throttled disk
will be worse, not better**.

Confidence: **sure** on the numbers; **likely** that index warm-up is the best first
move, since it addresses the cold case which is where 3.4 s lives.

---

### H4 — No single-instance guard, and a second instance turns a restore into an app that will not start

There is no `tauri-plugin-single-instance` in `src-tauri/Cargo.toml`, and no
`fileAssociations` or deep-link handling anywhere — I searched. Nothing stops the app
being launched twice.

Two windows against one `user.db` is mostly survivable — SQLite's WAL serialises writers
— but two specific things are not:

1. **Two manuscript autosaves on the same sermon, last write wins.** The sermon draft
   autosaves the whole body every 800 ms (`sermonDraft.ts:22`). Two windows open on one
   sermon silently destroy each other's work, and the app's central promise is that it
   never loses a keystroke.
2. **A staged restore becomes a permanent startup failure.** `backup.rs:194`:

   ```rust
       std::fs::rename(&pending, &user_db)?;
   ```

   The reader stages a restore, is told to restart, closes window 1 — window 2 is still
   open and still holds `user.db`. The next launch reaches `apply_pending_import` and
   the rename fails: Windows refuses to replace a file another process has open without
   `FILE_SHARE_DELETE`, which SQLite does not request. That `?` returns `Err`, which
   meets `.expect("failed to apply a staged import/restore")` at `lib.rs:149` — and by
   H2 that is a silent exit with no window. The pending marker is still there, so
   **every subsequent launch fails the same way** until someone deletes the file by hand.

**Smallest change:** add the plugin and focus the existing window instead of starting a
second app.

```toml
# src-tauri/Cargo.toml, [dependencies]
tauri-plugin-single-instance = "2"
```

```rust
// src-tauri/src/lib.rs, first plugin registered -- it must run before anything
// else touches user.db.
.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}))
```

This needs no capability change (it is a Rust-side plugin with no commands the page
calls). Fixing H2 as well means that if the rename ever does fail for another reason,
the reader is told why.

Confidence: **sure** that there is no guard and that `lib.rs:149` panics on a failed
rename. **Likely** on the Windows sharing-violation specifics — I reasoned from SQLite's
open flags rather than reproducing it with two installed instances, which C1 prevents.

---

### H5 — The EPUB reader parses untrusted books with `@xmldom/xmldom` 0.7.13, which has eight unfixed advisories

**Evidence — tool output**, `npm audit --omit=dev`:

```
xmldom: Attribute name injection via setAttribute() bypasses requireWellFormed
xmldom: Processing Instruction Target Injection Bypasses requireWellFormed
xmldom: DocType `name` Injection Bypasses requireWellFormed
xmldom: Parser silently accepts a not-well-formed end tag ...
xmldom: Quadratic-time attribute deduplication
xmldom: End-tag Whitespace-Trim Regex ReDoS - quadratic backtracking in the 0.8.x end-tag parser
xmldom: Quadratic-memory consumption
xmldom: Quadratic-time parsing via the malformed-input recovery path
...
node_modules/@xmldom/xmldom
  epubjs  0.3.89 - 0.3.93
```

```
$ npm ls @xmldom/xmldom
+-- epubjs@0.3.93
| `-- @xmldom/xmldom@0.7.13
```

This sits directly on the untrusted-file path: `EpubReader.tsx:279` opens whatever book
the reader imported, and epub.js parses its OPF, NCX and XHTML with this library. The
quadratic-time and quadratic-memory ones are the realistic harm — a malformed EPUB hangs
or balloons the webview, and since it is the app's own window that is the whole app. The
injection advisories are less serious here because `allowScriptedContent: false`
(`EpubReader.tsx:290`) keeps scripts from running in the book's frame, which is a good
decision already made.

`epubjs` 0.3.93 is also the last 0.3.x and is effectively unmaintained; `npm audit`
offers `epubjs@0.4.2` as a breaking change.

**Smallest change:** move to the line that carries a fixed `@xmldom/xmldom`:

```jsonc
// package.json — dependencies
"epubjs": "^0.4.2",   // was "^0.3.93"
```

0.4.x is a breaking change, so the EPUB reader needs a real pass afterwards — it uses
`renderTo`, `rendition.hooks.content`, `book.locations`, CFIs and the `selected` event,
all of which must be re-checked. If that is too much before the first release, the
holding fix is an npm `overrides` entry pinning `@xmldom/xmldom` to a patched version
under the existing epubjs, which is lower risk but needs testing that epub.js still
parses correctly against it.

Confidence: **sure** on the advisories and versions (tool output). **Likely** on
practical impact, since I did not craft a malformed EPUB to hang the reader.

---

# Medium

### M1 — The window is created before `setup` runs, so it shows blank and state is briefly unmanaged

In Tauri 2.11.5, config windows are created **before** the user `setup` hook. From the
vendored source, `tauri-2.11.5/src/app.rs`:

```
2524:  for window_config in app.config().app.windows.iter().filter(|w| w.create) {
2525:    WebviewWindowBuilder::from_config(app.handle(), window_config)?.build()?;
...
2530:  if let Some(setup) = app.setup.take() {
2531:    (setup)(app).map_err(|e| crate::Error::Setup(e.into()))?;
```

So the window exists, unpainted (the event loop has not started — `.run()` comes after
`build()`), while `setup` does its work: `apply_pending_import`, `db::open`,
`library::sync`, the trash sweep. Two consequences:

- **A blank frame on launch.** `db::open` measured 38 ms, so normally this is brief. But
  `library::sync` can trigger a full `VACUUM` of `user.db` (`library.rs:301-306`), which
  is seconds on a large file, with the window already on screen and frozen.
- **A window of time where `DbState` is not managed.** `app.manage(DbState(...))` is the
  second-to-last line of `setup` (`lib.rs:197`). Any `invoke` arriving before it cannot
  resolve `State<DbState>`. In practice the page must first parse a 2.1 MB JS bundle, so
  this is unlikely to fire — but it is ordering by luck, not by construction.

**Smallest change:** don't let the framework create the window; create it yourself when
the backend is actually ready. In `tauri.conf.json`:

```json
      {
        "title": "Sojourner's Study Companion",
        "create": false,
```

and at the end of `setup`, after `app.manage(...)`:

```rust
            tauri::WebviewWindowBuilder::from_config(
                app.handle(),
                &app.config().app.windows[0],
            )?
            .build()?;
```

This fixes the blank flash and the state race together, and costs nothing.

Confidence: **sure** on the ordering (quoted from the resolved crate source);
**unsure** how often the unmanaged-state race could actually be hit.

### M2 — Startup diagnostics are written to a console that does not exist in release

`lib.rs:140-143`:

```rust
                    eprintln!(
                        "[warning] no populated content.db bundled with this build -- \
                         run `npm run build:content` before `tauri build`. Starting with no Bible content."
                    );
```

Also `lib.rs:185` (`[library] sync failed`), `lib.rs:195` (`[trash] sweep failed`),
`library.rs:144` and `library.rs:304`. With `windows_subsystem = "windows"` there is no
console attached, so all of these go nowhere in a release build.

The first one matters most: given C1, a mis-assembled bundle is a live possibility, and
its symptom would be an app that opens with **no Bible text and no explanation
whatsoever**. The app already has a logs folder and a `crash_log` module that writes to
it.

**Smallest change:** send them somewhere a reader can retrieve. `crash_log.rs` already
has the machinery; add a sibling to `log_frontend_error`:

```rust
/// A startup problem worth telling someone about, in the same folder as the
/// crash logs. `eprintln!` goes nowhere in a windowed release build.
pub fn log_startup(app_data_dir: &Path, message: &str) {
    eprintln!("{message}");
    write_log(app_data_dir, "startup", message);
}
```

and call it in place of the `eprintln!`s above. For the missing-content case
specifically, a dialog (see H2's `fatal`) is better than a log, since an app with no
Bible in it is not usable.

Confidence: **sure**.

### M3 — `.pptx` bytes cross IPC as a JSON array of numbers

`src/api/client.ts:569-570`:

```ts
  exportSermonSlides: (token: string, data: Uint8Array) =>
    invoke<void>("export_sermon_slides", { token, data: Array.from(data) }),
```

`Array.from` turns each byte into a separate JSON number, so a payload is serialised at
roughly 4x its size and parsed element by element on the Rust side into `Vec<u8>`
(`commands/sermons.rs`). A slide deck with images is easily several MB, which is
millions of array elements.

The app already knows the right answer — `commands/tts.rs:15-19` returns audio as a raw
`tauri::ipc::Response` for exactly this reason:

```rust
/// Returned as a raw `Response` rather than a `Vec<u8>`: a verse is around a
/// megabyte of samples, and going through JSON would turn every byte into a
/// number in a giant array on the way across.
```

The same reasoning applies going the other way. Tauri 2 sends an `ArrayBuffer` or
`Uint8Array` argument as a raw request body.

**Smallest change:**

```ts
  exportSermonSlides: (token: string, data: Uint8Array) =>
    invoke<void>("export_sermon_slides", { token, data }),
```

The Rust signature (`data: Vec<u8>`) already accepts it.

Confidence: **likely** — the `Array.from` cost is certain, but I did not measure a real
deck, so I cannot say how many milliseconds it is in practice.

### M4 — `add_file` reads an entire XML file into a `String` to sniff four bytes, and misfiles non-UTF-8 files

`src-tauri/src/commands/library.rs:102-107`:

```rust
        let sample = std::fs::read_to_string(&src).unwrap_or_default();
        let subfolder = if sample.contains("<XMLBIBLE") {
            "bibles"
        } else {
            "commentaries"
        };
```

Two problems in one line. The Bible XML files in this repo are 2–9 MB and commentary
files larger, and the whole thing is read into memory to answer a question the first 8 KB
answers. And `unwrap_or_default()` means a file that is not valid UTF-8 — a UTF-16
Zefania export, which is a real and common thing — becomes an empty string, so it is
silently filed as a commentary.

The scanner already has the right helper. `import/mod.rs:44-51`:

```rust
fn read_sample(path: &Path) -> anyhow::Result<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    let mut buf = vec![0u8; 8192];
    let n = file.read(&mut buf)?;
    buf.truncate(n);
    Ok(String::from_utf8_lossy(&buf).to_string())
}
```

`from_utf8_lossy` is exactly the tolerance the misfiling case needs.

**Smallest change:** make `read_sample` public (`pub fn read_sample`) and use it:

```rust
        let sample = crate::import::read_sample(&src).unwrap_or_default();
```

Confidence: **sure** on the wasted read and the `unwrap_or_default` behaviour;
**likely** that a UTF-16 Bible XML is a case worth handling — it is common in the wild,
but I did not test one against this importer.

### M5 — `pptxgenjs` pulls `image-size` 1.2.1 with two high-severity DoS advisories

**Evidence — tool output**, `npm audit --omit=dev`:

```
image-size  <=2.0.2
Severity: high
image-size: ICNS parser allows denial of service through an infinite loop
image-size: JXL and HEIF parsers allow denial of service through infinite loops
  pptxgenjs  >=2.3.0
```

`npm ls` confirms `pptxgenjs@4.0.1 -> image-size@1.2.1`. Lower risk than H5: the images
reaching slide export come from the user's own illustration captures rather than an
arbitrary file, and the offending formats (ICNS, JXL, HEIF) are unlikely to appear. But
it is an infinite loop in the webview, which means a hung window and a lost export.

**Smallest change:** an `overrides` entry, since `pptxgenjs` has not yet released a
version that moves off it:

```jsonc
// package.json, top level
"overrides": { "image-size": "^2.0.3" }
```

Verify slide export with an image afterwards — the `image-size` 2.x API changed, so this
needs testing rather than trusting.

Confidence: **sure** on the advisory; **unsure** whether the override is drop-in.

### M6 — Placeholder crate metadata, and no publisher, ships into the Windows uninstall entry — resolved 2026-09-18

*Publisher and copyright are Colt McClish, the description says what the app is. Verified
on an install: the uninstall entry's Publisher and the executable's file properties both
read "Colt McClish".*

`src-tauri/Cargo.toml:2-5`:

```toml
name = "tauri-app"
version = "0.1.0"
description = "A Tauri App"
authors = ["you"]
```

and `tauri.conf.json`'s `bundle` block has no `publisher`, `copyright`, or
`licenseFile`. From `tauri-utils-2.9.3/src/config.rs:1572`:

```
  /// The application's publisher. Defaults to the second element in the identifier string.
```

so `com.sojourner.study` yields a publisher of **`sojourner`**, lowercase, in Add/Remove
Programs and in the uninstall registry key. That key is written at first install, which
is why this belongs on the pre-first-release list rather than the cleanup list.

The three versions do agree — `tauri.conf.json:4`, `Cargo.toml:3` and `package.json:4`
are all `0.1.0`. Good.

**Smallest change:**

```toml
# src-tauri/Cargo.toml
description = "Offline Bible study and sermon preparation"
authors = ["<your name>"]
```

```json
    "publisher": "<Your Name or Company>",
    "copyright": "© 2026 <Your Name>",
```

(`name = "tauri-app"` can stay — it is the crate name, not user-visible, and
`default-run` and the `_lib` suffix depend on it.)

Confidence: **sure**.

### M7 — `thml.rs` clones the entire file to attempt a UTF-8 conversion

`src-tauri/src/import/thml.rs:41-42`:

```rust
        let raw = std::fs::read(path)?;
        let text = String::from_utf8(raw.clone()).unwrap_or_else(|_| String::from_utf8_lossy(&raw).to_string());
```

The clone exists only so the lossy fallback still has the bytes. Calvin's commentary
files run to tens of megabytes each, and `build_content_db` imports dozens of them, so
this doubles peak memory on every one — for a fallback that almost never fires.
`FromUtf8Error` hands the original bytes back.

**Smallest change:**

```rust
        let raw = std::fs::read(path)?;
        let text = String::from_utf8(raw)
            .unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned());
```

Confidence: **sure**.

---

# Low

### L1 — `opener:default` grants `reveal-item-in-dir`, which nothing uses

`src-tauri/capabilities/default.json:7`:

```json
    "opener:default",
```

From `tauri-plugin-opener-2.5.5/permissions/default.toml`, that set is
`allow-open-url`, `allow-reveal-item-in-dir`, `allow-default-urls`. The scoped
`opener:allow-open-path` below it is genuinely narrow and genuinely needed —
`allow-open-path` is *not* in the default set, and `BackupsSection.tsx:82` calls
`openPath(await api.getLogsDir())`, which matches the `$APPDATA/logs` scope exactly.
That part is well done.

But `allow-reveal-item-in-dir` is unscoped and nothing calls `revealItemInDir` — I
searched the whole frontend. Harm is small (it opens an Explorer window; it returns
nothing), but the capability's own description says it is "deliberately short", and this
is the one entry that is not carrying its weight.

**Smallest change:** name the two permissions actually used instead of the set:

```json
    "opener:allow-open-url",
    "opener:allow-default-urls",
```

Confidence: **sure** that it is unused; **likely** that the two named permissions are
the complete replacement — worth confirming that external links still open from
`NoteBody.tsx:45`, `epubStyles.ts:362` and `AboutSection.tsx:12` after the change.

### L2 — `highlights.color` and `.style` have no `CHECK`

`src-tauri/src/db/schema.rs:969-970`:

```sql
  color          TEXT NOT NULL,
  style          TEXT NOT NULL DEFAULT 'highlight',
```

`commands/annotations.rs:50-51` takes both as unvalidated `String`. The frontend's
`HighlightColorKey` union and the five fixed pastels in `highlightColors.ts:17-23`
constrain it in practice, and the rendered value only reaches a CSS custom property
(`VerseRow.tsx:158`) where the CSP makes it inert — so this is tidiness, not a hole.
Most other enum-like columns in this schema do have `CHECK` constraints (there are
around twenty), so this is an inconsistency more than a defect.

**Smallest change**, in a new migration:

```sql
-- style is one of two things everywhere in the app; say so in the schema.
```

with the standard rebuild-copy-drop-rename — but note the warning at `db/mod.rs:149-163`
about foreign keys inside the migration transaction before rebuilding any table with
children. `highlights` is a parent of `notes.highlight_id`, so this needs the
copy-then-repoint form described there, not the twelve-step recipe. Given that, it is
probably not worth doing before release.

Confidence: **sure** on the absence; **likely** that it is not worth fixing now.

### L3 — `set_setting` accepts an unbounded value

`src-tauri/src/commands/settings.rs`:

```rust
pub fn set_setting(db: State<DbState>, key: String, value: String) -> AppResult<()> {
```

No cap on either. A runaway `useSetting` write loop could grow `user.db` without bound,
and every backup would then carry it. `list_with_prefix` escapes its LIKE pattern
correctly (`db/queries/settings.rs`), so there is no injection here.

**Smallest change:** a guard at the top of the command —

```rust
    anyhow::ensure!(value.len() <= 1_000_000, "that setting is too large to store");
```

Confidence: **sure** it is unbounded; **unsure** it matters, since nothing currently
writes anything large.

### L4 — 21 clippy style warnings, none about correctness

**Evidence — tool output**, `cargo clippy --all-targets`: 21 warnings in the lib, 23 in
the lib's tests. Grouped:

```
    5 warning: enclosing `Ok` and `?` operator are unneeded
    3 warning: consider using `sort_by_key`
    3 warning: doc list item without indentation
    2 warning: redundant closure
    1 warning: length comparison to zero
    1 warning: this function has too many arguments (9/7)
    1 warning: stripping a prefix manually
    1 warning: unnecessary use of `clone` to create a slice from a reference
    ... and 8 more of the same character
```

Every one is style. There is not a single correctness lint in the output. `cargo clippy
--fix` handles most of them. Worth doing sometime, not before release.

Confidence: **sure**.

### L5 — ~1.3 GB of bundled resources

`content.db` 966.9 MB + `library/` 143.6 MB + `models/` 169.6 MB, all bundled by
`tauri.conf.json:40-44`. The release binary is 77.38 MB (with `strip = true`,
`lto = true`, `codegen-units = 1`, `opt-level = 3` — the profile is set the way Tauri
recommends, and `panic = "unwind"` is deliberate and documented at `Cargo.toml:74-78`).

Not a defect, but worth deciding on knowingly: the installer will be over a gigabyte, the
NSIS LZMA compression step will be long, and the download and install time is what a
first-time user meets first. If C2 is resolved by removing three translations, roughly
220 MB of that comes off on its own.

Frontend bundle, from the production build (`✓ 2257 modules transformed`):

```
2159.3 KB  index-CYv447iT.js
1235.8 KB  pdf.worker.min-Dswkl-cV.mjs
 359.7 KB  pptxgen.es-Bl6kmh6K.js
 249.4 KB  basemap-BSRdd3lX.js
  65.3 KB  index-0vHPfF0j.css
```

A 2.1 MB main chunk is large but loads from disk, not a network, so it costs
parse time rather than download time. No source maps are emitted. No `devtools` feature
is enabled anywhere. One `console.info` remains
(`src/features/notes/useNoteRefsBackfill.ts:53`), on a once-per-database backfill path,
not a hot one.

Confidence: **sure** (measured).

---

# Sections that came back clean

- **IPC surface.** I cross-checked every `invoke` name in `src/` against
  `generate_handler!` in `lib.rs`: **218 registered, all reachable; every `invoke`
  targets a registered command; no orphans in either direction.** Argument names match
  after camelCase conversion. `tsc --noEmit` exits 0.
- **Path handling from the frontend.** `commands/file_picker.rs` is the strongest idea
  in this codebase: dialogs run in Rust and the page receives a single-use random token,
  never a path, so there is no path for a compromised webview to name. Four tests cover
  token reuse, unknown tokens, and unbounded growth. `resolve_backup_path`
  (`commands/backup.rs:94-113`) rejects separators, `..`, absolute paths and drive
  letters, then re-checks containment after `canonicalize` — and canonicalizes both
  sides, so the `\\?\` prefix compares consistently. Its tests include the traversal
  cases.
- **Secrets.** Nothing tracked matches `.env`, `.pem`, `.key`, `.pfx`, `.p12`,
  `id_rsa`, or credential-shaped strings. `.gitignore` covers `content/`, `models/`,
  `.cache/`, `dist`, `node_modules` and editor files, with a written explanation of why
  `library/` is deliberately *not* ignored.
- **Rust tests.** `cargo test --release`: **78 passed, 0 failed, 1 ignored** (the ignored
  one is `migrates_real_user_db_copy`, which needs a real database via
  `SOJOURNER_USER_DB_COPY` and is correctly opt-in). These are not filler — they cover
  the pre-import backup capturing the WAL, refusing a newer schema both at open and at
  import, soft-delete hiding rows from every list/search/tag path, FTS reindexing across
  a migration, backlink cascades, and path traversal. This is the area I would have
  expected to find problems in and did not.
- **Frontend tests.** `npm test`: **25 passed across 4 files.**
- **Events.** Exactly one `listen` in the app (`lib/appClose.ts:58`), and it handles both
  the unlisten-on-teardown and the torn-down-before-`listen`-resolves race — with a test
  asserting each (`appClose.test.ts:99,108`). The close handshake itself
  (`lib.rs:72-91` plus a 2 s backstop) is the right design for an app with an autosaving
  manuscript.
- **Error boundaries and crash reporting.** `ErrorBoundary` at the router level plus
  per-pane fallbacks, deliberately dependency-free so it can render when the app cannot;
  `componentDidCatch` forwards to the same `logs/` folder as the Rust panic hook; the
  crash screen tells the reader where the log is. `MAX_LOG_FILES = 200` bounds the
  folder, and keeps the *oldest* on the reasoning that the first failure explains the
  rest. React `StrictMode` is on.
- **No network calls at runtime.** Searched and found none.
- **Locks and `unsafe`.** No `unsafe` blocks in the crate. No lock is held across an
  `await`. Mutex poisoning is handled deliberately in all three places it can occur
  (`db/mod.rs:23`, `file_picker.rs:38`, `tts.rs:97`), each with a written justification
  for why recovery is sound — and the `tts.rs` one documents a real bug this fixed.
  H1 is about lock *duration*, not lock *correctness*.

---

# What I could not verify, and why

- **Anything downstream of the installer.** C1 means no installer exists, so I could not
  check `nsis.installMode: "currentUser"`, the `webviewInstallMode: offlineInstaller`
  path, per-user vs per-machine behaviour, first-run on a clean machine, upgrade over a
  previous version, or uninstall. The bundle configuration has been read but **never
  executed**. Re-run this section once C1 is fixed. *2026-09-18: done on this machine —
  built, installed per-user, run, upgraded over a previous build, uninstalled; see C1. A
  clean machine is still untested.*
- **`cargo audit`** — not installed, and I did not install anything. The Rust dependency
  tree is therefore unaudited. `Cargo.lock` is committed, so this is a single command
  once the tool is available. Worth running before release: `pdf-extract 0.12`,
  `mobi 0.8` and `zip 8.6` all parse untrusted files.
- **ESLint** — not installed and no config file exists (no `.eslintrc*`, no
  `eslint.config.*`). `tsc --noEmit` passes, which covers types but not lint rules.
- **`tauri build` with the real `beforeBuildCommand`.** I overrode it to skip
  `npm run build:content`, which rebuilds the 967 MB content database from scratch. The
  frontend half of that command ran normally. The content build itself is unexercised
  in this review.
- **DPI scaling, keyboard focus order, and non-ASCII user names/paths.** These need a
  running installed app on a real desktop; I reviewed the code but did not observe
  behaviour. `paths.rs` derives everything from `app_data_dir()`, and the token-based
  file picker means user-chosen paths never round-trip as strings, so the non-ASCII risk
  looks low — but "looks low" is not "tested".
- **BOM handling in the XML importers.** `read_sample` uses `from_utf8_lossy` so
  detection is safe, and `thml.rs` falls back to lossy, but I did not test a UTF-8-BOM or
  UTF-16 file end to end through `roxmltree::Document::parse` (`thml.rs:45`). Related to
  M4.
- **Performance on a modest laptop.** All timings are from this machine, which has an
  NVMe SSD. The cold-cache figures in H3 are the ones that will degrade most on slower
  storage.
- **H4's Windows sharing-violation specifics.** Reasoned from SQLite's file-open flags
  rather than reproduced, since reproducing it needs two installed instances.
