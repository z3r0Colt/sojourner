use std::path::PathBuf;

/// True for a file the reader added themselves: one that sits in the
/// "imports" folder under the app data dir, not among the bundled copies
/// content.db was built from. The same test `rescan_imports_after_upgrade`
/// picks its files by.
pub fn is_reader_import(path: &str) -> bool {
    std::path::Path::new(path).components().any(|c| c.as_os_str() == "imports")
}

/// `base/<name>` for a plain folder name (letters, digits, '-', '_'); None
/// for anything that could reach elsewhere ("..", "a/b", "").
pub fn safe_child(base: &std::path::Path, name: &str) -> Option<PathBuf> {
    let ok = !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    ok.then(|| base.join(name))
}
