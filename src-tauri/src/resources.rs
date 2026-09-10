use rusqlite::Connection;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

#[derive(Debug, Default, serde::Serialize)]
pub struct BulkImportOutcome {
    pub imported: Vec<String>,
    pub skipped_duplicate: Vec<String>,
    pub skipped_excluded: Vec<String>,
    pub skipped_unrecognized: Vec<String>,
    pub errors: Vec<String>,
}

fn walk_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_files(&path, out);
        } else {
            out.push(path);
        }
    }
}

/// Recursively imports every file of a recognized kind under `source_folder`
/// as a Resource: title from the file name, author from its immediate parent
/// directory name (an `Author/Book.epub` layout -- a file sitting directly in
/// `source_folder` gets no author). `exclude_relative` skips exact paths or
/// whole subtrees, given relative to `source_folder` (case-insensitive, `/`
/// or `\` separators both accepted) -- e.g. `["Bibles", "Reformers/John
/// Calvin/Commentary on Romans.epub"]`. Already-imported titles (matched by
/// title + author) are skipped rather than duplicated, so re-running an
/// import after adding more files to the folder is safe.
pub fn import_folder(
    conn: &Connection,
    resources_dir: &Path,
    source_folder: &Path,
    exclude_relative: &[&str],
) -> anyhow::Result<BulkImportOutcome> {
    let exclude_norm: Vec<String> = exclude_relative.iter().map(|s| s.to_lowercase().replace('\\', "/")).collect();
    let mut outcome = BulkImportOutcome::default();

    let mut files = Vec::new();
    walk_files(source_folder, &mut files);
    files.sort();

    for path in files {
        let rel = match path.strip_prefix(source_folder) {
            Ok(r) => r.to_string_lossy().replace('\\', "/").to_lowercase(),
            Err(_) => continue,
        };
        if exclude_norm.iter().any(|ex| rel == *ex || rel.starts_with(&format!("{ex}/"))) {
            outcome.skipped_excluded.push(rel);
            continue;
        }
        let Some(kind) = detect_kind(&path) else {
            outcome.skipped_unrecognized.push(rel);
            continue;
        };
        // A few real-world filenames carry HTML-entity-escaped punctuation
        // in their names (e.g. "Tryal &amp; Triumph...epub") -- decode it so
        // the title reads naturally instead of showing the raw escape.
        let raw_title = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| rel.clone());
        let title = quick_xml::escape::unescape(&raw_title).map(|s| s.into_owned()).unwrap_or(raw_title);
        let author = path
            .parent()
            .filter(|p| *p != source_folder)
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string());

        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM resources WHERE title = ?1 AND author IS ?2",
                rusqlite::params![title, author],
                |_| Ok(()),
            )
            .is_ok();
        if exists {
            outcome.skipped_duplicate.push(title);
            continue;
        }

        match import_one(conn, resources_dir, &path, kind, &title, author.as_deref()) {
            Ok(()) => outcome.imported.push(title),
            Err(e) => outcome.errors.push(format!("{title}: {e:#}")),
        }
    }

    Ok(outcome)
}

fn import_one(conn: &Connection, resources_dir: &Path, src: &Path, kind: &str, title: &str, author: Option<&str>) -> anyhow::Result<()> {
    let file_name = src.file_name().ok_or_else(|| anyhow::anyhow!("invalid file path"))?;
    let mut dest_path = resources_dir.join(file_name);
    let mut counter = 1;
    while dest_path.exists() {
        let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("resource");
        let ext = src.extension().and_then(|s| s.to_str()).unwrap_or("");
        dest_path = resources_dir.join(format!("{stem}-{counter}.{ext}"));
        counter += 1;
    }
    std::fs::copy(src, &dest_path)?;
    let extracted = extract_text(&dest_path, kind);
    crate::db::queries::resources::create(conn, kind, title, author, &dest_path.display().to_string(), extracted.as_deref())?;
    Ok(())
}

pub fn detect_kind(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    Some(match ext.as_str() {
        "epub" => "epub",
        "pdf" => "pdf",
        "mobi" | "azw" | "azw3" => "mobi",
        "mp4" | "mkv" | "webm" | "mov" | "avi" | "m4v" => "video",
        "mp3" | "m4a" | "wav" | "ogg" | "flac" | "aac" => "audio",
        _ => return None,
    })
}

/// Removes an entire element, tags and content both -- unlike a plain tag
/// strip, which would leave a `<style>` block's CSS rules (or a `<script>`
/// block's JS) sitting in the extracted text as if it were prose.
fn strip_element(html: &str, tag: &str) -> String {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut out = String::with_capacity(html.len());
    let mut rest = html;
    loop {
        match rest.find(&open) {
            Some(start) => {
                out.push_str(&rest[..start]);
                match rest[start..].find(&close) {
                    Some(end) => rest = &rest[start + end + close.len()..],
                    None => return out, // unterminated -- drop the rest rather than emit a broken tail
                }
            }
            None => {
                out.push_str(rest);
                return out;
            }
        }
    }
}

fn strip_html_tags(html: &str) -> String {
    let html = strip_element(html, "style");
    let html = strip_element(&html, "script");
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    let joined = out.split_whitespace().collect::<Vec<_>>().join(" ");
    quick_xml::escape::unescape(&joined).map(|s| s.into_owned()).unwrap_or(joined)
}

fn extract_epub_text(path: &Path) -> anyhow::Result<String> {
    let file = File::open(path)?;
    let mut zip = zip::ZipArchive::new(file)?;
    let mut combined = String::new();
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        let name = entry.name().to_lowercase();
        if name.ends_with(".xhtml") || name.ends_with(".html") || name.ends_with(".htm") {
            let mut content = String::new();
            if entry.read_to_string(&mut content).is_ok() {
                combined.push_str(&strip_html_tags(&content));
                combined.push('\n');
            }
        }
    }
    Ok(combined)
}

fn extract_mobi_text(path: &Path) -> anyhow::Result<String> {
    let m = mobi::Mobi::from_path(path)?;
    let content = m.content_as_string().map_err(|e| anyhow::anyhow!("{e}"))?;
    Ok(strip_html_tags(&content))
}

fn extract_pdf_text(path: &Path) -> anyhow::Result<String> {
    Ok(pdf_extract::extract_text(path)?)
}

/// Best-effort text extraction for full-text search indexing. Failures (encrypted
/// PDFs, malformed files, unsupported variants) are swallowed -- the resource is
/// still usable, it just won't appear in deep-search results.
pub fn extract_text(path: &Path, kind: &str) -> Option<String> {
    let result = match kind {
        "pdf" => extract_pdf_text(path),
        "epub" => extract_epub_text(path),
        "mobi" => extract_mobi_text(path),
        _ => return None,
    };
    match result {
        Ok(text) if !text.trim().is_empty() => Some(text),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::strip_html_tags;

    #[test]
    fn style_and_script_blocks_are_dropped_entirely_not_just_untagged() {
        let html = r#"<html><head><style type="text/css">.h1 { font-weight: bold; }</style>
        <script>alert('hi')</script></head><body><p>Real prose here.</p></body></html>"#;
        let text = strip_html_tags(html);
        assert_eq!(text, "Real prose here.");
    }

    #[test]
    fn numeric_and_named_entities_are_decoded() {
        let html = "<p>Father&#8217;s house &amp; home</p>";
        assert_eq!(strip_html_tags(html), "Father\u{2019}s house & home");
    }
}
