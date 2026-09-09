fn main() {
    // tauri_build::build() validates that every `bundle.resources` path exists,
    // on *every* cargo build of this crate -- including the standalone
    // `build_content_db` binary that produces content.db in the first place.
    // On a fresh checkout that file doesn't exist yet, so seed an empty
    // placeholder here; `npm run build:content` overwrites it with the real
    // thing before packaging. content/ is gitignored, so this runs once per
    // clone/clean.
    let content_db = std::path::Path::new("../content/content.db");
    if !content_db.exists() {
        if let Some(parent) = content_db.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::File::create(content_db);
    }

    tauri_build::build()
}
