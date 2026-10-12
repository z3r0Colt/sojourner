//! The words inside a rich-text body.
//!
//! Notes, chapter notes, sermons, and illustrations are written in the
//! editor and stored as HTML, and the search indexes are built from what
//! this returns rather than from that markup -- otherwise "strong" matches
//! every note someone has emboldened a word in, and a snippet comes back as
//! tags. It is exposed to SQL as `html_text()` (see `db::register_functions`)
//! so the indexing triggers can call it.
//!
//! Deliberately not the same as the resource importer's own stripper
//! (`resources::extract_text`), which puts a space at every tag and is tuned
//! for whole books: here a tag *inside* a word must not split it, or
//! `sw<em>orn</em>` would be indexed as two half-words nobody can search for.

/// Tags that stand between words. Everything else is inline: a tag boundary
/// there is not a gap, so `<strong>sworn</strong>,` keeps its comma and
/// `sw<em>orn</em>` is one word.
const BLOCK_TAGS: [&str; 21] = [
    "p", "div", "br", "hr", "li", "ul", "ol", "blockquote", "pre", "table", "tr", "td", "th", "section", "article",
    "h1", "h2", "h3", "h4", "h5", "h6",
];

/// Drops a whole element, contents and all -- for the two whose text is
/// never prose.
fn drop_element(html: &str, tag: &str) -> String {
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
                    // Unterminated: everything after it is inside the element.
                    None => return out,
                }
            }
            None => {
                out.push_str(rest);
                return out;
            }
        }
    }
}

/// The readable words of an HTML body: tags removed, block boundaries left
/// as a single space, entities decoded (so `don&#39;t` is searchable as
/// `don't`), and whitespace collapsed.
pub fn html_to_text(html: &str) -> String {
    let html = drop_element(html, "script");
    let html = drop_element(&html, "style");

    let mut out = String::with_capacity(html.len());
    let mut tag = String::new();
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => {
                in_tag = true;
                tag.clear();
            }
            '>' if in_tag => {
                in_tag = false;
                let name = tag
                    .trim_start_matches('/')
                    .split(|c: char| !c.is_ascii_alphanumeric())
                    .next()
                    .unwrap_or("")
                    .to_ascii_lowercase();
                if BLOCK_TAGS.contains(&name.as_str()) {
                    out.push(' ');
                }
            }
            _ if in_tag => tag.push(c),
            _ => out.push(c),
        }
    }

    let collapsed = out.split_whitespace().collect::<Vec<_>>().join(" ");
    quick_xml::escape::unescape(&collapsed)
        .map(|s| s.into_owned())
        .unwrap_or(collapsed)
}

#[cfg(test)]
mod tests {
    use super::html_to_text;

    #[test]
    fn tags_become_words_and_only_block_tags_leave_a_gap() {
        assert_eq!(
            html_to_text("<p>The <strong>oath</strong> of God is <em>sworn</em>, and bound.</p>"),
            "The oath of God is sworn, and bound."
        );
        // A block boundary is a gap; an inline one inside a word is not.
        assert_eq!(html_to_text("<p>one</p><p>two</p>"), "one two");
        assert_eq!(html_to_text("<p>sw<em>orn</em></p>"), "sworn");
        assert_eq!(html_to_text("<h2>A point</h2><p>and its prose</p>"), "A point and its prose");
    }

    #[test]
    fn entities_are_decoded_so_the_words_are_searchable() {
        assert_eq!(html_to_text("<p>don&#39;t &amp; won&apos;t</p>"), "don't & won't");
        assert_eq!(html_to_text("<p>a &lt;div&gt; in prose</p>"), "a <div> in prose");
    }

    #[test]
    fn script_and_style_are_dropped_with_their_contents() {
        assert_eq!(html_to_text("<p>before</p><script>var x = 1;</script><p>after</p>"), "before after");
        assert_eq!(html_to_text("<style>p { color: red }</style><p>prose</p>"), "prose");
    }

    #[test]
    fn a_body_that_is_already_plain_text_is_left_as_it_is() {
        assert_eq!(html_to_text("Just a sentence."), "Just a sentence.");
        assert_eq!(html_to_text(""), "");
    }
}
