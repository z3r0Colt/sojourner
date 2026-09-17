// Crash logs (Phase 8): a Rust panic anywhere in the backend, or an
// uncaught JS error/promise rejection in the webview, gets written to
// `<app_data_dir>/logs/` as a plain text file -- so a user who hits a crash
// has something concrete to attach to a bug report, and it's inspectable
// without a debugger. No content is sent anywhere; these are local files
// the user chooses whether to share (see LibrarySettingsView's "Open Logs
// Folder" button, and the no-telemetry statement next to it).
use std::path::{Path, PathBuf};

fn logs_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("logs")
}

/// How many log files to keep before writing no more. An error thrown inside
/// a component that is re-rendering writes one of these per frame, so this is
/// a real bound and not a theoretical one.
const MAX_LOG_FILES: usize = 200;

fn write_log(app_data_dir: &Path, prefix: &str, body: &str) {
    let dir = logs_dir(app_data_dir);
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    // Keep the folder to a size a reader can actually attach to a bug report,
    // and stop a render loop from filling the disk one file per frame. The
    // oldest are kept rather than the newest: the first failure is the one
    // that explains the rest.
    if std::fs::read_dir(&dir).map(|d| d.count()).unwrap_or(0) >= MAX_LOG_FILES {
        return;
    }
    let timestamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%.3fZ");
    let path = dir.join(format!("{prefix}-{timestamp}.log"));
    let _ = std::fs::write(path, body);
}

/// Installs a panic hook that writes a crash log before Rust's default
/// hook still runs (stderr, and -- since panic = "abort" isn't set --
/// unwinding continues from there, matching the default behavior this is
/// layered on top of rather than replacing).
pub fn install_panic_hook(app_data_dir: PathBuf) {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".to_string());
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "(non-string panic payload)".to_string());
        let body = format!(
            "Sojourner -- backend panic\nWhen: {}\nWhere: {location}\nMessage: {payload}\n",
            chrono::Utc::now().to_rfc3339(),
        );
        write_log(&app_data_dir, "crash", &body);
        default_hook(info);
    }));
}

/// Records an uncaught error or promise rejection from the webview (the
/// panic hook above only sees Rust-side panics -- the frontend reports its
/// own via this command instead).
pub fn log_frontend_error(app_data_dir: &Path, message: &str, stack: Option<&str>) {
    let body = format!(
        "Sojourner -- frontend error\nWhen: {}\nMessage: {message}\n{}",
        chrono::Utc::now().to_rfc3339(),
        stack.map(|s| format!("Stack:\n{s}\n")).unwrap_or_default(),
    );
    write_log(app_data_dir, "frontend-error", &body);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frontend_error_is_written_to_the_logs_folder_with_its_message_and_stack() {
        let dir = std::env::temp_dir().join(format!("sojourner-crashlog-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        log_frontend_error(&dir, "TypeError: x is not a function", Some("at foo (app.js:1:1)"));

        let entries: Vec<_> = std::fs::read_dir(logs_dir(&dir)).unwrap().collect::<Result<_, _>>().unwrap();
        assert_eq!(entries.len(), 1);
        let contents = std::fs::read_to_string(entries[0].path()).unwrap();
        assert!(contents.contains("TypeError: x is not a function"));
        assert!(contents.contains("at foo (app.js:1:1)"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
