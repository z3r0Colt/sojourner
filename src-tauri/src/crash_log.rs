// Crash logs (Phase 8): a Rust panic anywhere in the backend, or an
// uncaught JS error/promise rejection in the webview, gets written to
// `<app_data_dir>/logs/` as a plain text file -- so a user who hits a crash
// has something concrete to attach to a bug report, and it's inspectable
// without a debugger. No content is sent anywhere; these are local files
// the user chooses whether to share (see LibrarySettingsView's "Open Logs
// Folder" button, and the no-telemetry statement next to it).
use std::cell::Cell;
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

// Panics a caller has said it will catch.
//
// The read-aloud voice runs its text through a crate that can panic on text it
// was never meant to see, and its model can panic on input it was never meant
// to get. `tts` catches both, skips the one piece of text that did it, and
// reads on. Before that was marked, every such panic still went through the
// hook below as a "crash" -- one log per skipped sentence, so a book that
// tripped the voice on every page could fill this folder's two hundred files
// in an evening and leave no room for the crash that actually took the app
// down. So a caught panic is written as `recovered-...`, says it was caught,
// and only the first few are kept at all.
//
// "The first few" are counted in the folder, not in memory. A count kept for
// one run only slowed the folder filling up: twenty a run, and ten evenings of
// a book that trips the voice would have taken every slot a crash could have
// had. Counted on disk, recovered logs never hold more than twenty of the two
// hundred, however many runs they come from.

thread_local! {
    /// Set while this thread runs work under `catch_recoverable`.
    static RECOVERING: Cell<bool> = const { Cell::new(false) };
}

/// How many recovered-panic logs the folder may hold, across every run. The
/// first few say what the voice keeps tripping on; the hundredth says nothing
/// new.
const MAX_RECOVERED_LOGS: usize = 20;

/// The file-name prefix recovered-panic logs are written, and counted, under.
const RECOVERED_PREFIX: &str = "recovered";

/// Writes a recovered-panic log, unless the folder already holds as many as
/// it may. The oldest are kept, as for crashes (see `write_log`).
fn write_recovered_log(app_data_dir: &Path, body: &str) {
    let prefix = format!("{RECOVERED_PREFIX}-");
    let on_disk = std::fs::read_dir(logs_dir(app_data_dir))
        .map(|entries| entries.flatten().filter(|entry| entry.file_name().to_string_lossy().starts_with(&prefix)).count())
        .unwrap_or(0);
    if on_disk >= MAX_RECOVERED_LOGS {
        return;
    }
    write_log(app_data_dir, RECOVERED_PREFIX, body);
}

/// Runs `work`, catching a panic in it, and tells the panic hook that a panic
/// on this thread meanwhile is caught and recovered from -- not a crash.
pub fn catch_recoverable<R>(work: impl FnOnce() -> R) -> std::thread::Result<R> {
    let outer = RECOVERING.with(|flag| flag.replace(true));
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(work));
    RECOVERING.with(|flag| flag.set(outer));
    result
}

/// How a panic happening now on this thread is to be logged.
#[derive(Debug, PartialEq, Eq)]
enum PanicLog {
    Crash,
    Recovered,
}

fn panic_log() -> PanicLog {
    // `try_with`, because a panic while the thread is being torn down finds
    // its locals already gone; that one is a crash like any other.
    if RECOVERING.try_with(|flag| flag.get()).unwrap_or(false) {
        PanicLog::Recovered
    } else {
        PanicLog::Crash
    }
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
        let when = chrono::Utc::now().to_rfc3339();
        match panic_log() {
            PanicLog::Crash => {
                let body = format!("Sojourner -- backend panic\nWhen: {when}\nWhere: {location}\nMessage: {payload}\n");
                write_log(&app_data_dir, "crash", &body);
            }
            PanicLog::Recovered => {
                let body = format!(
                    "Sojourner -- backend panic, caught and recovered from (not a crash)\nWhen: {when}\nWhere: {location}\nMessage: {payload}\n"
                );
                write_recovered_log(&app_data_dir, &body);
            }
        }
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

    /// Judged by what the hook would call the log rather than by installing
    /// the hook: it is process-wide, and a test that holds it catches every
    /// other test's panics too (see the note in `resources`'s tests).
    #[test]
    fn a_panic_under_catch_recoverable_is_not_logged_as_a_crash() {
        assert_eq!(panic_log(), PanicLog::Crash);
        assert_eq!(catch_recoverable(panic_log).unwrap(), PanicLog::Recovered);

        // A panic inside is caught, and the thread is a crash thread again
        // afterwards: the marker does not outlive the work it was for.
        let caught = catch_recoverable(|| panic!("a sentence the voice could not say"));
        assert!(caught.is_err());
        assert_eq!(panic_log(), PanicLog::Crash);

        // Nested, the inner one ending does not unmark the outer.
        let outer = catch_recoverable(|| {
            let _ = catch_recoverable(|| ());
            panic_log()
        });
        assert_eq!(outer.unwrap(), PanicLog::Recovered);
    }

    /// Recovered logs are capped by what is in the folder, so the cap holds
    /// across runs -- the folder here stands in for one left by earlier runs --
    /// and a crash still finds room once they have reached it.
    #[test]
    fn recovered_logs_stop_at_the_cap_on_disk_and_leave_room_for_a_crash() {
        let dir = std::env::temp_dir().join(format!("sojourner-crashlog-recovered-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let logs = logs_dir(&dir);
        std::fs::create_dir_all(&logs).unwrap();
        let count = |prefix: &str| {
            std::fs::read_dir(&logs)
                .unwrap()
                .flatten()
                .filter(|entry| entry.file_name().to_string_lossy().starts_with(prefix))
                .count()
        };

        // Earlier runs left one short of the cap: one more is written.
        for run in 0..MAX_RECOVERED_LOGS - 1 {
            std::fs::write(logs.join(format!("recovered-earlier-{run}.log")), "caught").unwrap();
        }
        write_recovered_log(&dir, "caught again");
        assert_eq!(count("recovered-"), MAX_RECOVERED_LOGS);

        // At the cap, no more -- this run or any later one.
        write_recovered_log(&dir, "caught once too often");
        assert_eq!(count("recovered-"), MAX_RECOVERED_LOGS);

        // A crash is still written.
        write_log(&dir, "crash", "a real crash");
        assert_eq!(count("crash-"), 1);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
