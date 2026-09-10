# Sojourner's Study Companion

A desktop Bible study application built with Tauri, Rust, and React/TypeScript. It bundles multiple public-domain Bible translations, classic commentaries, Strong's lexicon data, cross-references, and the Westminster Standards for offline study, reading, and note-taking.

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

`npm run tauri build` produces an NSIS installer (per-user, no admin rights required, WebView2 runtime embedded so install works offline) and an MSI. Two pieces of Windows packaging need something only the app's publisher can provide, so they're configured as far as possible here and documented rather than faked:

- **Code signing.** An unsigned `.exe`/installer triggers a Windows SmartScreen warning. Signing needs an Authenticode code-signing certificate (from a CA, or an EV cert on a hardware token) that only the publisher can obtain. Once you have one, either install it into the Windows certificate store and set `bundle.windows.certificateThumbprint` in `tauri.conf.json`, or sign out-of-band with `signtool` after `tauri build` completes. See the [Tauri Windows code-signing guide](https://v2.tauri.app/distribute/sign/windows/).
- **Auto-updater.** Tauri's updater plugin needs a signing keypair (`tauri signer generate`) whose private key must be kept secret and used to sign every release, plus a hosted JSON endpoint describing available updates and a place to host the signed artifacts. None of that infrastructure exists yet; adding `tauri-plugin-updater` with a placeholder key would make the app *appear* to check for updates while silently doing nothing, which is worse than not having it, so it's left out until real hosting is in place. See the [Tauri updater guide](https://v2.tauri.app/plugin/updater/).

Already in place: per-user install and an offline-capable WebView2 bootstrap (`tauri.conf.json`'s `bundle.windows`), `PRAGMA user_version`-based schema migrations (`src-tauri/src/db/mod.rs`), and crash logs for both backend panics and uncaught frontend errors, written to `<app data dir>/logs/` (see "Open Logs Folder" in Library settings) with no data ever leaving the device.

**Portable build.** Tauri's bundler targets (`msi`, `nsis`) are both installers; there's no first-class "extract and run" target. A portable folder can still be assembled by hand from a release build: copy `src-tauri/target/release/tauri-app.exe` alongside `content/content.db` (matching the path `bundle.resources` maps it to, `content.db` next to the executable) into one folder. This hasn't been scripted or tested end-to-end on a clean Windows machine, so treat it as a starting point, not a verified release artifact.
