use crate::error::AppResult;
use crate::update::{self, UpdateCheck};
use tauri::AppHandle;

/// Asks GitHub whether a newer release has been published. Nothing is
/// downloaded or installed -- the answer carries a link, and the reader takes
/// it from there.
///
/// `async` and `spawn_blocking` for the reason `commands::backup` sets out at
/// length: a non-`async` command runs on the thread that draws, and this one
/// waits on the network for up to ten seconds. On the main thread that is a
/// window frozen at the moment the reader pressed a button, which is the
/// worst possible moment.
///
/// The version compared is `tauri.conf.json`'s, by way of `package_info()`,
/// not `CARGO_PKG_VERSION`. The two are both 0.1.0 today and nothing keeps
/// them in step; the one Windows shows in Apps & features, and the one a
/// reader reads in About, is this one.
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> AppResult<UpdateCheck> {
    let current = app.package_info().version.to_string();
    let checked = tauri::async_runtime::spawn_blocking(move || update::check(&current))
        .await
        .map_err(|e| anyhow::anyhow!("the update check did not finish: {e}"))?;
    Ok(checked?)
}

/// The running version, for About to show without asking anything of the
/// network.
///
/// A command rather than the page calling `getVersion()` from
/// `@tauri-apps/api/app`, for the reason the capability's own description
/// gives: that call needs an app permission granted in `capabilities/
/// default.json`, and a command of our own needs none. It also reads the same
/// `package_info()` the update check compares against, so the version a
/// reader sees and the version tested against the release tag cannot drift.
#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}
