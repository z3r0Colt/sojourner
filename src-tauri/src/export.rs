// Plain-Markdown export for material a student wants outside the app: a
// study note pulled into a paper or teaching handout. Deliberately plain
// Markdown rather than a rich format -- it opens cleanly in anything, prints
// cleanly, and needs no library beyond String formatting.
use crate::models::{ChapterNote, Note, PrayerEntry, Sermon};
use std::collections::HashMap;

fn book_name(book_names: &HashMap<i64, String>, book_id: i64) -> String {
    book_names.get(&book_id).cloned().unwrap_or_else(|| format!("Book #{book_id}"))
}

fn verse_ref(book_names: &HashMap<i64, String>, book_id: i64, chapter: i64, verse_start: Option<i64>, verse_end: Option<i64>) -> String {
    let mut s = format!("{} {}", book_name(book_names, book_id), chapter);
    if let Some(vs) = verse_start {
        s.push_str(&format!(":{vs}"));
        if let Some(ve) = verse_end {
            if ve != vs {
                s.push_str(&format!("-{ve}"));
            }
        }
    }
    s
}

/// Renders a single passage note as Markdown: the passage reference as a
/// heading, the note body below it.
pub fn format_note(note: &Note, book_names: &HashMap<i64, String>) -> String {
    let heading = verse_ref(book_names, note.book_id, note.chapter, Some(note.verse_start), Some(note.verse_end));
    format!("# {heading}\n\n{}\n", note.body)
}

/// Renders a chapter note as Markdown: the chapter reference as a heading,
/// the note body below it.
pub fn format_chapter_note(note: &ChapterNote, book_names: &HashMap<i64, String>) -> String {
    let heading = format!("{} {}", book_name(book_names, note.book_id), note.chapter);
    format!("# {heading}\n\n{}\n", note.body)
}

/// Renders a prayer journal entry as Markdown: the date as a heading, then
/// either the four ACTS sections (whichever are filled in) or the free-write
/// body, plus the linked passage if there is one.
pub fn format_prayer_entry(entry: &PrayerEntry, book_names: &HashMap<i64, String>) -> String {
    let mut out = format!("# Prayer — {}\n\n", entry.entry_date);
    if let (Some(book_id), Some(chapter)) = (entry.book_id, entry.chapter) {
        out.push_str(&format!(
            "**Passage:** {}\n\n",
            verse_ref(book_names, book_id, chapter, entry.verse_start, entry.verse_end)
        ));
    }
    if entry.mode == "free" {
        if let Some(text) = &entry.free_text {
            out.push_str(text);
            out.push('\n');
        }
    } else {
        for (label, body) in [
            ("Adoration", &entry.adoration),
            ("Confession", &entry.confession),
            ("Thanksgiving", &entry.thanksgiving),
            ("Supplication", &entry.supplication),
        ] {
            if let Some(text) = body {
                out.push_str(&format!("## {label}\n\n{text}\n\n"));
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Sermons (SB0.2). The manuscript is tiptap HTML whose passage blocks hold
// only a reference, so the export renders each one from the database first
// (`passage_text`, keyed as "book:chapter:start:end") -- a file handed to
// someone else has to carry the words, not a pointer to them.

/// The key `passage_text` is looked up by, so the command that fills the map
/// and the renderer that reads it can never disagree about its shape.
pub fn passage_key(book_id: i64, chapter: i64, verse_start: Option<i64>, verse_end: Option<i64>) -> String {
    format!("{book_id}:{chapter}:{}:{}", verse_start.unwrap_or(0), verse_end.unwrap_or(0))
}

/// Renders a whole sermon as Markdown: the header (big idea, text, date,
/// church, preacher), then the manuscript with passages as block quotes and
/// citations with their source lines.
pub fn format_sermon(
    sermon: &Sermon,
    passage_text: &HashMap<String, String>,
    book_names: &HashMap<i64, String>,
) -> String {
    let mut out = format!("# {}\n\n", sermon.title);
    if let Some(big_idea) = sermon.big_idea.as_deref().filter(|s| !s.trim().is_empty()) {
        out.push_str(&format!("*{big_idea}*\n\n"));
    }

    let texts: Vec<String> = sermon
        .passages
        .iter()
        .filter(|p| p.role == "text")
        .map(|p| verse_ref(book_names, p.book_id, p.chapter, p.verse_start, p.verse_end))
        .collect();
    if !texts.is_empty() {
        out.push_str(&format!("**Text:** {}\n\n", texts.join("; ")));
    }
    for (label, value) in [
        ("Date", sermon.preach_date.clone()),
        ("Series", sermon.series_title.clone()),
        ("Church", sermon.venue.clone()),
        ("Preacher", sermon.preacher.clone()),
    ] {
        if let Some(value) = value.filter(|v| !v.trim().is_empty()) {
            out.push_str(&format!("**{label}:** {value}\n\n"));
        }
    }
    out.push_str("---\n\n");
    out.push_str(&html_to_markdown(&sermon.body, passage_text, book_names));

    if let Some(reflection) = sermon.reflection.as_deref().filter(|s| !s.trim().is_empty()) {
        out.push_str(&format!("\n---\n\n## Reflection\n\n{reflection}\n"));
    }
    out
}

// --- A very small HTML reader, enough for what the editor writes ----------
//
// The manuscript is tiptap's own output: headings, paragraphs, lists,
// blockquotes, rules, the three inline marks, and the sermon builder's two
// custom nodes. That is a closed set, so a full HTML parser (and a new
// dependency) would be far more machinery than the job needs.

#[derive(Debug)]
enum Node {
    Text(String),
    Element { tag: String, attrs: HashMap<String, String>, children: Vec<Node> },
}

const VOID_TAGS: &[&str] = &["br", "hr", "img", "input", "meta", "link"];

fn parse_html(html: &str) -> Vec<Node> {
    let bytes: Vec<char> = html.chars().collect();
    let mut i = 0;
    let mut stack: Vec<(String, HashMap<String, String>, Vec<Node>)> = Vec::new();
    let mut roots: Vec<Node> = Vec::new();

    let push_node = |node: Node, stack: &mut Vec<(String, HashMap<String, String>, Vec<Node>)>, roots: &mut Vec<Node>| {
        match stack.last_mut() {
            Some((_, _, children)) => children.push(node),
            None => roots.push(node),
        }
    };

    while i < bytes.len() {
        if bytes[i] == '<' {
            let Some(end) = (i..bytes.len()).find(|&j| bytes[j] == '>') else { break };
            let raw: String = bytes[i + 1..end].iter().collect();
            i = end + 1;
            if raw.starts_with('/') {
                let tag = raw[1..].trim().to_ascii_lowercase();
                // Close up to the matching open tag, so stray markup can't
                // swallow the rest of the document.
                if let Some(pos) = stack.iter().rposition(|(t, _, _)| *t == tag) {
                    while stack.len() > pos {
                        let (tag, attrs, children) = stack.pop().expect("checked by the loop bound");
                        push_node(Node::Element { tag, attrs, children }, &mut stack, &mut roots);
                    }
                }
                continue;
            }
            let self_closing = raw.ends_with('/');
            let raw = raw.trim_end_matches('/');
            let mut parts = raw.splitn(2, char::is_whitespace);
            let tag = parts.next().unwrap_or_default().to_ascii_lowercase();
            let attrs = parse_attrs(parts.next().unwrap_or_default());
            if self_closing || VOID_TAGS.contains(&tag.as_str()) {
                push_node(Node::Element { tag, attrs, children: Vec::new() }, &mut stack, &mut roots);
            } else {
                stack.push((tag, attrs, Vec::new()));
            }
        } else {
            let Some(next) = (i..bytes.len()).find(|&j| bytes[j] == '<') else {
                let text: String = bytes[i..].iter().collect();
                push_node(Node::Text(decode_entities(&text)), &mut stack, &mut roots);
                break;
            };
            let text: String = bytes[i..next].iter().collect();
            push_node(Node::Text(decode_entities(&text)), &mut stack, &mut roots);
            i = next;
        }
    }
    // Anything still open at the end closes here.
    while let Some((tag, attrs, children)) = stack.pop() {
        push_node(Node::Element { tag, attrs, children }, &mut stack, &mut roots);
    }
    roots
}

fn parse_attrs(raw: &str) -> HashMap<String, String> {
    let mut attrs = HashMap::new();
    let chars: Vec<char> = raw.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        let start = i;
        while i < chars.len() && chars[i] != '=' && !chars[i].is_whitespace() {
            i += 1;
        }
        if i == start {
            break;
        }
        let name: String = chars[start..i].iter().collect::<String>().to_ascii_lowercase();
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        if i < chars.len() && chars[i] == '=' {
            i += 1;
            while i < chars.len() && chars[i].is_whitespace() {
                i += 1;
            }
            let quote = if i < chars.len() && (chars[i] == '"' || chars[i] == '\'') {
                let q = chars[i];
                i += 1;
                Some(q)
            } else {
                None
            };
            let vstart = i;
            match quote {
                Some(q) => {
                    while i < chars.len() && chars[i] != q {
                        i += 1;
                    }
                }
                None => {
                    while i < chars.len() && !chars[i].is_whitespace() {
                        i += 1;
                    }
                }
            }
            let value: String = chars[vstart..i.min(chars.len())].iter().collect();
            attrs.insert(name, decode_entities(&value));
            if quote.is_some() && i < chars.len() {
                i += 1;
            }
        } else {
            attrs.insert(name, String::new());
        }
    }
    attrs
}

fn decode_entities(s: &str) -> String {
    s.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}

fn attr_i64(attrs: &HashMap<String, String>, name: &str) -> Option<i64> {
    attrs.get(name).and_then(|v| v.trim().parse().ok())
}

/// The manuscript as Markdown. `passage_text` supplies the words for each
/// passage block (see `passage_key`); a block with no text falls back to its
/// reference alone, which is what an uninstalled translation would give.
fn html_to_markdown(
    html: &str,
    passage_text: &HashMap<String, String>,
    book_names: &HashMap<i64, String>,
) -> String {
    let mut out = String::new();
    for node in parse_html(html) {
        render_block(&node, passage_text, book_names, &mut out, "");
    }
    while out.ends_with("\n\n\n") {
        out.pop();
    }
    out
}

fn render_block(
    node: &Node,
    passage_text: &HashMap<String, String>,
    book_names: &HashMap<i64, String>,
    out: &mut String,
    prefix: &str,
) {
    let (tag, attrs, children) = match node {
        Node::Text(text) => {
            // Whitespace between blocks; anything else is a stray run of text.
            if !text.trim().is_empty() {
                out.push_str(&format!("{prefix}{}\n\n", text.trim()));
            }
            return;
        }
        Node::Element { tag, attrs, children } => (tag.as_str(), attrs, children),
    };

    let data_type = attrs.get("data-type").map(String::as_str).unwrap_or("");
    if data_type == "passage" {
        let (Some(book_id), Some(chapter)) = (attr_i64(attrs, "data-book-id"), attr_i64(attrs, "data-chapter")) else {
            return;
        };
        let verse_start = attr_i64(attrs, "data-verse-start");
        let verse_end = attr_i64(attrs, "data-verse-end");
        let reference = verse_ref(book_names, book_id, chapter, verse_start, verse_end);
        out.push_str(&format!("{prefix}**{reference}**\n\n"));
        if let Some(text) = passage_text.get(&passage_key(book_id, chapter, verse_start, verse_end)) {
            for line in wrap_quote(text) {
                out.push_str(&format!("{prefix}> {line}\n"));
            }
            out.push('\n');
        }
        return;
    }
    if data_type == "source" {
        let mut inner = String::new();
        for child in children {
            render_block(child, passage_text, book_names, &mut inner, "");
        }
        for line in inner.trim().lines() {
            out.push_str(&format!("{prefix}> {line}\n"));
        }
        if let Some(label) = attrs.get("data-label").filter(|l| !l.trim().is_empty()) {
            out.push_str(&format!("{prefix}>\n{prefix}> — {label}\n"));
        }
        out.push('\n');
        return;
    }

    match tag {
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
            let level = tag[1..].parse::<usize>().unwrap_or(2);
            out.push_str(&format!("{prefix}{} {}\n\n", "#".repeat(level), inline(children)));
        }
        "p" => {
            let text = inline(children);
            if !text.trim().is_empty() {
                out.push_str(&format!("{prefix}{}\n\n", text.trim()));
            }
        }
        "hr" => out.push_str(&format!("{prefix}---\n\n")),
        "blockquote" => {
            let mut inner = String::new();
            for child in children {
                render_block(child, passage_text, book_names, &mut inner, "");
            }
            for line in inner.trim().lines() {
                out.push_str(&format!("{prefix}> {line}\n"));
            }
            out.push('\n');
        }
        "ul" | "ol" => {
            let ordered = tag == "ol";
            let mut n = 0;
            for child in children {
                if let Node::Element { tag, children, .. } = child {
                    if tag == "li" {
                        n += 1;
                        let marker = if ordered { format!("{n}. ") } else { "- ".into() };
                        let mut inner = String::new();
                        for grandchild in children {
                            render_block(grandchild, passage_text, book_names, &mut inner, "");
                        }
                        let inner = inner.trim();
                        let text = if inner.is_empty() { inline(children) } else { inner.to_string() };
                        let mut lines = text.lines();
                        if let Some(first) = lines.next() {
                            out.push_str(&format!("{prefix}{marker}{first}\n"));
                        }
                        for line in lines {
                            out.push_str(&format!("{prefix}  {line}\n"));
                        }
                    }
                }
            }
            out.push('\n');
        }
        // A wrapper the editor emits around content (a node view's shell,
        // a div someone pasted): render what is inside it.
        _ => {
            let has_blocks = children.iter().any(|c| {
                matches!(c, Node::Element { tag, .. } if matches!(tag.as_str(), "p" | "h1" | "h2" | "h3" | "ul" | "ol" | "blockquote" | "div" | "hr"))
            });
            if has_blocks {
                for child in children {
                    render_block(child, passage_text, book_names, out, prefix);
                }
            } else {
                let text = inline(children);
                if !text.trim().is_empty() {
                    out.push_str(&format!("{prefix}{}\n\n", text.trim()));
                }
            }
        }
    }
}

/// Inline content with the three marks the document mode allows. A `blank`
/// span keeps its word -- the answer key is the manuscript.
fn inline(nodes: &[Node]) -> String {
    let mut out = String::new();
    for node in nodes {
        match node {
            Node::Text(text) => out.push_str(text),
            Node::Element { tag, children, .. } => match tag.as_str() {
                "strong" | "b" => out.push_str(&format!("**{}**", inline(children))),
                "em" | "i" => out.push_str(&format!("*{}*", inline(children))),
                "u" => out.push_str(&format!("_{}_", inline(children))),
                "br" => out.push_str("  \n"),
                "code" => out.push_str(&format!("`{}`", inline(children))),
                _ => out.push_str(&inline(children)),
            },
        }
    }
    out
}

/// Verse text as quote lines, one sentence-ish run per line so a long
/// passage does not become one unreadable paragraph in a text editor.
fn wrap_quote(text: &str) -> Vec<String> {
    let text = text.trim();
    if text.is_empty() {
        return Vec::new();
    }
    text.split_inclusive(". ")
        .fold(Vec::new(), |mut acc: Vec<String>, part| {
            match acc.last_mut() {
                Some(last) if last.len() + part.len() < 90 => last.push_str(part),
                _ => acc.push(part.to_string()),
            }
            acc
        })
        .into_iter()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Sermon, SermonPassage};

    fn sermon(body: &str) -> Sermon {
        Sermon {
            id: 1,
            title: "The God who works all things".into(),
            big_idea: Some("God bends every thread toward the good of his people.".into()),
            body: body.into(),
            status: "draft".into(),
            stage: "manuscript".into(),
            preach_date: Some("2026-09-13".into()),
            series_id: None,
            series_order: None,
            venue: Some("Grace Church".into()),
            preacher: Some("A. Preacher".into()),
            translation_id: Some(1),
            target_minutes: Some(35),
            reflection: None,
            created_at: "2026-09-01".into(),
            updated_at: "2026-09-01".into(),
            deleted_at: None,
            passages: vec![SermonPassage {
                id: 1,
                sermon_id: 1,
                role: "text".into(),
                book_id: 45,
                chapter: 8,
                verse_start: Some(28),
                verse_end: Some(30),
                sort_order: 0,
            }],
            sources: Vec::new(),
            tags: Vec::new(),
            events: Vec::new(),
            series_title: Some("Romans".into()),
        }
    }

    /// The export has to carry the words: a passage block holds only a
    /// reference, so the rendered text from the database has to land in the
    /// file, with the header, headings, marks, lists, and citations intact.
    #[test]
    fn sermon_export_renders_passages_and_the_document() {
        let body = concat!(
            "<h2>The <strong>call</strong> of God</h2>",
            "<p>He <em>works</em> all things.</p>",
            r#"<div data-type="passage" data-book-id="43" data-chapter="3" data-verse-start="16" data-verse-end="16"></div>"#,
            r#"<blockquote data-type="source" data-kind="commentary" data-ref-id="commentary:42" data-label="Henry on Romans 8"><p>All things work together.</p></blockquote>"#,
            "<ul><li>First</li><li>Second</li></ul>",
            "<p>A <span data-blank=\"\">blank</span> word.</p>",
        );
        let book_names: HashMap<i64, String> =
            [(43, "John".to_string()), (45, "Romans".to_string())].into_iter().collect();
        let passage_text: HashMap<String, String> =
            [(passage_key(43, 3, Some(16), Some(16)), "For God so loved the world...".to_string())]
                .into_iter()
                .collect();

        let md = format_sermon(&sermon(body), &passage_text, &book_names);

        assert!(md.starts_with("# The God who works all things\n"), "{md}");
        assert!(md.contains("**Text:** Romans 8:28-30"), "{md}");
        assert!(md.contains("**Series:** Romans"), "{md}");
        assert!(md.contains("## The **call** of God"), "{md}");
        assert!(md.contains("He *works* all things."), "{md}");
        assert!(md.contains("**John 3:16**"), "{md}");
        assert!(md.contains("> For God so loved the world..."), "{md}");
        assert!(md.contains("> All things work together."), "{md}");
        assert!(md.contains("> — Henry on Romans 8"), "{md}");
        assert!(md.contains("- First\n- Second"), "{md}");
        assert!(md.contains("A blank word."), "a blank keeps its word: {md}");
    }
}
