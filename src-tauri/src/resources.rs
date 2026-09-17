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

/// Where a copy of `src` should go inside `resources_dir`: its own file name
/// if nothing is there, else the stem with `-1`, `-2`, ... until one is free.
///
/// Both import paths -- this module's folder import and the single-file
/// `commands::resources::add_resource` -- need exactly this, and had their
/// own copy of it. Both also produced a trailing dot for a file with no
/// extension at all (`book-1.`), which is not a name anyone meant to write;
/// the extension is now only appended when there is one.
pub fn free_destination_path(resources_dir: &Path, src: &Path) -> anyhow::Result<PathBuf> {
    let file_name = src.file_name().ok_or_else(|| anyhow::anyhow!("invalid file path"))?;
    let mut dest_path = resources_dir.join(file_name);
    let mut counter = 1;
    while dest_path.exists() {
        let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("resource");
        let name = match src.extension().and_then(|s| s.to_str()) {
            Some(ext) if !ext.is_empty() => format!("{stem}-{counter}.{ext}"),
            _ => format!("{stem}-{counter}"),
        };
        dest_path = resources_dir.join(name);
        counter += 1;
    }
    Ok(dest_path)
}

fn import_one(conn: &Connection, resources_dir: &Path, src: &Path, kind: &str, title: &str, author: Option<&str>) -> anyhow::Result<()> {
    let dest_path = free_destination_path(resources_dir, src)?;
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
                // `<head` must not match `<header`: the name has to end where
                // the tag's attributes (or its end) begin.
                let ends_name = match rest[start + open.len()..].chars().next() {
                    None | Some('>') | Some('/') => true,
                    Some(c) => c.is_whitespace(),
                };
                if !ends_name {
                    let skip = start + open.len();
                    out.push_str(&rest[..skip]);
                    rest = &rest[skip..];
                    continue;
                }
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
    // The head holds the section's <title>, which is the book's name repeated
    // once per chapter -- not prose, and it would make a book of nothing but
    // page scans look as though it had text to search.
    let html = strip_element(html, "head");
    let html = strip_element(&html, "style");
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
                // The table of contents is the chapter titles over again; it
                // belongs to the reader's Contents list, not to the index.
                if content.contains("epub:type=\"toc\"") || content.contains("epub:type='toc'") {
                    continue;
                }
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

/// Above this, a pdf/epub/mobi is added without being indexed. Extraction
/// holds the whole document and its extracted text in memory at once, and a
/// quarter-gigabyte book is a scan, not prose -- the resource is still
/// findable by title, author and tag. Audio and video are not capped:
/// nothing is extracted from them anyway, and they are legitimately large.
pub const MAX_EXTRACT_BYTES: u64 = 256 * 1024 * 1024;

/// Best-effort text extraction for full-text search indexing. Failures (encrypted
/// PDFs, malformed files, unsupported variants) are swallowed -- the resource is
/// still usable, it just won't appear in deep-search results.
///
/// That includes a *panic*: `pdf_extract` panics outright on some malformed
/// input, and before this the whole app went down with it, losing whatever
/// was unsaved. `catch_unwind` turns that into the same `None` every other
/// failure produces. The panic hook still runs first, so the crash log keeps
/// its entry -- a file that cannot be indexed is still worth knowing about.
/// This is why the release profile unwinds rather than aborting.
pub fn extract_text(path: &Path, kind: &str) -> Option<String> {
    extract_text_within(path, kind, MAX_EXTRACT_BYTES)
}

/// `extract_text` with the size cap given rather than assumed, so a test can
/// cross it without writing a quarter of a gigabyte to disk.
fn extract_text_within(path: &Path, kind: &str, max_bytes: u64) -> Option<String> {
    if !matches!(kind, "pdf" | "epub" | "mobi") {
        return None;
    }
    if std::fs::metadata(path).map(|m| m.len()).unwrap_or(0) > max_bytes {
        return None;
    }
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| match kind {
        "pdf" => extract_pdf_text(path),
        "epub" => extract_epub_text(path),
        _ => extract_mobi_text(path),
    }));
    match result {
        Ok(Ok(text)) if !text.trim().is_empty() => Some(text),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{extract_text, extract_text_within, free_destination_path, strip_html_tags};
    use std::path::PathBuf;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sojourner-extract-test-{label}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// The one destination-naming rule both import paths now share, including
    /// the case that used to come out as `book-1.` with a trailing dot.
    #[test]
    fn a_second_copy_of_a_book_is_numbered_and_never_left_ending_in_a_dot() {
        let dir = temp_dir("dest");

        // Nothing there yet: the file keeps its own name.
        let src = dir.join("Institutes.epub");
        assert_eq!(free_destination_path(&dir, &src).unwrap(), dir.join("Institutes.epub"));

        // Taken once, then twice.
        std::fs::write(dir.join("Institutes.epub"), b"x").unwrap();
        assert_eq!(free_destination_path(&dir, &src).unwrap(), dir.join("Institutes-1.epub"));
        std::fs::write(dir.join("Institutes-1.epub"), b"x").unwrap();
        assert_eq!(free_destination_path(&dir, &src).unwrap(), dir.join("Institutes-2.epub"));

        // A file with no extension gets no trailing dot.
        let bare = dir.join("book");
        std::fs::write(dir.join("book"), b"x").unwrap();
        assert_eq!(free_destination_path(&dir, &bare).unwrap(), dir.join("book-1"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// A valid one-page PDF whose font dictionary is whatever is given, with
    /// the cross-reference offsets computed so the file really does parse.
    fn pdf_with_font(font_dict: &str) -> Vec<u8> {
        let stream = b"BT /F1 18 Tf 72 700 Td (Sojourner) Tj ET";
        let objs: Vec<Vec<u8>> = vec![
            b"<< /Type /Catalog /Pages 2 0 R >>".to_vec(),
            b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_vec(),
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>".to_vec(),
            format!("<< /Length {} >>
stream
{}
endstream", stream.len(), String::from_utf8_lossy(stream)).into_bytes(),
            format!("<< {font_dict} >>").into_bytes(),
        ];
        let mut out: Vec<u8> = b"%PDF-1.4
".to_vec();
        let mut offsets = Vec::new();
        for (i, body) in objs.iter().enumerate() {
            offsets.push(out.len());
            out.extend_from_slice(format!("{} 0 obj
", i + 1).as_bytes());
            out.extend_from_slice(body);
            out.extend_from_slice(b"
endobj
");
        }
        let xref = out.len();
        out.extend_from_slice(format!("xref
0 {}
0000000000 65535 f 
", objs.len() + 1).as_bytes());
        for off in &offsets {
            out.extend_from_slice(format!("{off:010} 00000 n 
").as_bytes());
        }
        out.extend_from_slice(
            format!("trailer
<< /Size {} /Root 1 0 R >>
startxref
{}
%%EOF
", objs.len() + 1, xref).as_bytes(),
        );
        out
    }

    const PLAIN_FONT: &str = "/Type /Font /Subtype /Type1 /BaseFont /Helvetica";
    // StandardEncoding is a legal PDF encoding that pdf-extract's
    // `encoding_to_unicode_table` does not handle: it panics outright. This
    // is the real shape of the crash the release profile used to abort on.
    const PANICKING_FONT: &str = "/Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /StandardEncoding";

    #[test]
    fn an_intact_pdf_still_gives_up_its_text() {
        let dir = temp_dir("intact");
        let path = dir.join("book.pdf");
        std::fs::write(&path, pdf_with_font(PLAIN_FONT)).unwrap();
        assert!(extract_text(&path, "pdf").unwrap().contains("Sojourner"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_pdf_that_panics_the_extractor_is_caught_and_still_logged() {
        let dir = temp_dir("panicking");
        let path = dir.join("hostile.pdf");
        std::fs::write(&path, pdf_with_font(PANICKING_FONT)).unwrap();

        // The app's own hook, so this also proves the claim that a caught
        // panic still leaves a crash log behind for the reader to send on.
        let previous = std::panic::take_hook();
        crate::crash_log::install_panic_hook(dir.clone());

        let extracted = extract_text(&path, "pdf");

        std::panic::set_hook(previous);

        assert!(extracted.is_none(), "a panicking extraction must come back as None, not unwind out");

        // Counted by what the logs *say*, not by how many there are.
        //
        // `install_panic_hook` sets the process-wide hook, and a Rust test
        // binary runs its tests on threads of one process -- so for as long
        // as this test holds the hook, a panic anywhere else in the suite
        // writes its crash log into this folder too. An assertion failure in
        // an unrelated test is such a panic. Asserting on the total file
        // count therefore made a failure over here into a second, misleading
        // failure over there, at exactly the moment the suite was already
        // hard to read.
        //
        // What this test actually claims is narrower and is what is checked:
        // the hostile PDF left one crash log, and that log names the panic.
        let bodies: Vec<String> = std::fs::read_dir(dir.join("logs"))
            .expect("the panic hook should have made a logs folder")
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with("crash-"))
            .filter_map(|e| std::fs::read_to_string(e.path()).ok())
            .collect();
        let ours: Vec<&String> = bodies.iter().filter(|b| b.contains("unexpected encoding")).collect();
        assert_eq!(
            ours.len(),
            1,
            "one caught panic should leave exactly one crash log naming it, got {ours:?} (of {} in the folder)",
            bodies.len()
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_file_over_the_size_cap_is_added_without_being_indexed() {
        let dir = temp_dir("cap");
        let path = dir.join("big.pdf");
        let bytes = pdf_with_font(PLAIN_FONT);
        std::fs::write(&path, &bytes).unwrap();

        // Under the cap it indexes; a cap below its size skips it entirely,
        // leaving the resource searchable by title alone.
        assert!(extract_text_within(&path, "pdf", bytes.len() as u64).is_some());
        assert!(extract_text_within(&path, "pdf", (bytes.len() - 1) as u64).is_none());

        // Audio and video are never extracted and so are never capped.
        assert!(extract_text_within(&path, "audio", 0).is_none());
        assert!(extract_text_within(&path, "video", 0).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

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

    #[test]
    fn the_head_is_dropped_so_a_page_scan_indexes_as_nothing() {
        // Every section of a scanned book carries the book's name in its
        // title and an image in its body: no text to search.
        let html = r#"<html><head><title>A Scanned Book</title></head>
        <body><div><img src="page1.png" alt=""/></div></body></html>"#;
        assert_eq!(strip_html_tags(html), "");
    }

    #[test]
    fn a_header_element_is_not_mistaken_for_the_head() {
        let html = "<html><head><title>Gone</title></head><body><header>Chapter One</header><p>Kept.</p></body></html>";
        assert_eq!(strip_html_tags(html), "Chapter One Kept.");
    }

    #[test]
    fn an_ocr_layer_is_indexed_like_any_other_text() {
        // A searchable scan writes its OCR into the page as transparent text.
        let html = r#"<html><head><title>Scan</title></head><body><div class="page"><img src="p1.png"/>
        <span class="ocr" style="color:transparent">It is a great mercy</span></div></body></html>"#;
        assert_eq!(strip_html_tags(html), "It is a great mercy");
    }
}
