use std::fs::File;
use std::io::Read;
use std::path::Path;

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

fn strip_html_tags(html: &str) -> String {
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
    out.split_whitespace().collect::<Vec<_>>().join(" ")
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
