//! Webster's American Dictionary of the English Language (1828), from the
//! letter files `tools/build-webster1828.py` writes into
//! `reference/webster1828/` (see SOURCES.md there), into `webster_entries`,
//! `webster_aliases` and the index over them (see CONTENT_MIGRATION_0028).
//!
//! The build script already refuses markup it did not write. This checks the
//! same promises again at the other end, because this is where a broken one
//! would reach a reader. An entry's HTML goes into the page as it is, so a tag
//! outside the four the reader expects, or markup left open, would be drawn
//! -- or would swallow the rest of the popup. A `data-osis` the app's
//! reference parser cannot read, or one naming a verse the KJV does not have,
//! is a link that opens nothing, or opens the wrong place: the same parser
//! (`crossrefs::parse_ref_range`) reads ISBE's links, so it is the one these
//! are held to. So an entry with no headword, no text or no markup, a key
//! that is not its headword in lower case, a tag or an entity the reader is
//! not promised, a link that does not resolve, an alias that is not a key,
//! an entry out of order or filed under the wrong letter -- any of these fails
//! the build, and every one found is reported together, as church history's
//! are, so that a bad run of the script is diagnosed in one pass rather than
//! one complaint at a time.
//!
//! Entries go in in the files' order -- by key, and within a key in Webster's
//! own order (LET the verb, then LET the noun, then LET the suffix) --
//! numbered from 1, and `sort` is that number. The files promise that order,
//! and the import checks it rather than sorting, so a file out of order is
//! caught instead of being quietly re-ordered into something the script did
//! not write. The same files give the same numbers on every build.
//!
//! Gated on the table being empty, like the other shipped references: the
//! data is fixed at a pinned commit of its source, so a build that has it has
//! all of it.

use rusqlite::{params, Connection};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// The summary the build script writes beside the letter files: which files
/// there are, and how many entries and links they hold between them.
pub const INDEX_FILE: &str = "_index.json";

/// A build with a great many problems is almost always one mistake many times
/// over; the first few say what it is, and the count says how far it reaches.
const PROBLEMS_SHOWN: usize = 40;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RawEntry {
    /// The headword, capitalised, Webster's accent marks removed: "Prevent".
    pub word: String,
    /// The headword in lower case: what a lookup asks for, and shared by
    /// homographs.
    pub key: String,
    /// Webster's abbreviation ("v.t.", "pp."), or none where the heading
    /// prints none.
    #[serde(default)]
    pub pos: Option<String>,
    pub html: String,
    /// The entry as plain text, a line per paragraph.
    pub text: String,
    /// Other keys the entry answers to (see CONTENT_MIGRATION_0028).
    #[serde(default)]
    pub aliases: Vec<String>,
    /// Build provenance: which rendering of the source dump the text came from.
    /// Checked, not stored.
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub content_paras: Vec<u32>,
}

#[derive(Deserialize)]
struct Index {
    total_entries: usize,
    total_refs: usize,
    files: Vec<String>,
}

/// Where a scripture link may point. `books` are the OSIS codes the app
/// knows (`books.osis_code`); `last_verse` is the KJV's last verse of each
/// chapter, keyed by (OSIS code, chapter), or `None` where the database has
/// no KJV to check against (a bare test database), and then only the shape
/// of each reference and its book are checked.
pub struct LinkTargets {
    pub books: HashSet<String>,
    pub last_verse: Option<HashMap<(String, i64), i64>>,
}

impl LinkTargets {
    /// Read from the content database being built: the canon from
    /// CONTENT_MIGRATION_0001, the chapters from the KJV the app ships --
    /// the text the script found each verse in.
    fn load(conn: &Connection) -> anyhow::Result<LinkTargets> {
        let books: HashSet<String> = super::crossrefs::load_book_lookup(conn)?.into_keys().collect();
        let mut stmt = conn.prepare(
            "SELECT b.osis_code, v.chapter, MAX(v.verse)
             FROM verses v JOIN translations t ON t.id = v.translation_id JOIN books b ON b.id = v.book_id
             WHERE t.code = 'KJV'
             GROUP BY v.book_id, v.chapter",
        )?;
        let chapters: HashMap<(String, i64), i64> = stmt
            .query_map([], |r| Ok(((r.get::<_, String>(0)?, r.get::<_, i64>(1)?), r.get::<_, i64>(2)?)))?
            .collect::<Result<_, _>>()?;
        Ok(LinkTargets { books, last_verse: (!chapters.is_empty()).then_some(chapters) })
    }
}

/// Reads an entry's markup against what the reader is promised, and returns
/// the `data-osis` of each scripture link in it.
///
/// Promised: the entry is paragraphs, and nothing stands outside one; inside
/// a paragraph there is text, `<b>`, `<i>` and `<a class="scripref"
/// data-osis="...">`, each closed in the order it was opened, with no
/// paragraph inside another and no link inside a link; every `&` begins one
/// of the entities an escaper writes, and no `<` or `>` stands loose in the
/// text.
pub fn check_html(html: &str) -> Result<Vec<String>, String> {
    const LINK_OPEN: &str = "<a class=\"scripref\" data-osis=\"";
    const ENTITIES: [&str; 5] = ["&amp;", "&lt;", "&gt;", "&quot;", "&#39;"];
    let mut osis: Vec<String> = Vec::new();
    let mut open: Vec<&'static str> = Vec::new();
    let mut paragraphs = 0;
    let mut rest = html;
    while !rest.is_empty() {
        let Some(at) = rest.find(['<', '>', '&']) else {
            if open.is_empty() && !rest.trim().is_empty() {
                return Err(format!("text outside a paragraph: \"{}\"", clip(rest)));
            }
            break;
        };
        if open.is_empty() && !rest[..at].trim().is_empty() {
            return Err(format!("text outside a paragraph: \"{}\"", clip(&rest[..at])));
        }
        rest = &rest[at..];
        if rest.starts_with('>') {
            return Err("a loose \">\" in the text".to_string());
        }
        if rest.starts_with('&') {
            let Some(entity) = ENTITIES.iter().find(|e| rest.starts_with(**e)) else {
                return Err(format!("an \"&\" that is not an entity: \"{}\"", clip(rest)));
            };
            rest = &rest[entity.len()..];
            continue;
        }
        let Some(end) = rest.find('>') else {
            return Err(format!("markup never closed: \"{}\"", clip(rest)));
        };
        let tag = &rest[..=end];
        rest = &rest[end + 1..];
        match tag {
            "<p>" if open.is_empty() => {
                open.push("p");
                paragraphs += 1;
            }
            "<p>" => return Err("a paragraph inside another element".to_string()),
            "<b>" | "<i>" if !open.is_empty() => open.push(if tag == "<b>" { "b" } else { "i" }),
            "</p>" | "</b>" | "</i>" | "</a>" => {
                let name = &tag[2..tag.len() - 1];
                if open.last() != Some(&name) {
                    return Err(format!("{tag} closes {}", open.last().map_or("nothing".to_string(), |o| format!("<{o}>"))));
                }
                open.pop();
            }
            _ if tag.len() >= LINK_OPEN.len() + 2
                && tag.starts_with(LINK_OPEN)
                && tag.ends_with("\">")
                && !open.is_empty()
                && !open.contains(&"a") =>
            {
                let value = &tag[LINK_OPEN.len()..tag.len() - 2];
                if value.is_empty() || value.contains('"') {
                    return Err(format!("a link with no reference: {tag}"));
                }
                osis.push(value.to_string());
                open.push("a");
            }
            _ => return Err(format!("markup the reader is not promised: {tag}")),
        }
    }
    if let Some(unclosed) = open.last() {
        return Err(format!("<{unclosed}> is never closed"));
    }
    if paragraphs == 0 {
        return Err("no paragraph".to_string());
    }
    Ok(osis)
}

/// Checks one link against the app's reference parser and the verses there
/// are. A range must stay within one chapter of one book, since that is all
/// `parse_ref_range` reads of it (the right-hand side's verse): the source's
/// ranges are a quotation split across two verses, or a whole chapter.
pub fn check_osis(osis: &str, targets: &LinkTargets) -> Result<(), String> {
    let Some((book, chapter, first, last)) = super::crossrefs::parse_ref_range(osis) else {
        return Err(format!("\"{osis}\" is not a reference the app can read"));
    };
    if let Some((_, right)) = osis.split_once('-') {
        let same_chapter = super::crossrefs::parse_ref(right).is_some_and(|(b, c, _)| b == book && c == chapter);
        if !same_chapter {
            return Err(format!("\"{osis}\" runs past the chapter it starts in"));
        }
    }
    if !targets.books.contains(book) {
        return Err(format!("\"{osis}\" names a book the app does not have"));
    }
    if chapter < 1 || first < 1 || last < first {
        return Err(format!("\"{osis}\" is not a chapter and verse"));
    }
    if let Some(last_verse) = &targets.last_verse {
        match last_verse.get(&(book.to_string(), chapter)) {
            None => return Err(format!("\"{osis}\": the KJV has no {book} {chapter}")),
            Some(&max) if last > max => return Err(format!("\"{osis}\": {book} {chapter} ends at verse {max}")),
            Some(_) => {}
        }
    }
    Ok(())
}

/// A key or an alias: lower-case letters, and hyphens or spaces between them
/// ("bugle-horn", "bears foot"). The lookup lower-cases what it is asked and
/// compares it to these exactly, so anything else could never be found.
fn is_key(s: &str) -> bool {
    let bytes = s.as_bytes();
    !bytes.is_empty()
        && bytes[0].is_ascii_lowercase()
        && bytes[bytes.len() - 1].is_ascii_lowercase()
        && bytes.iter().all(|b| b.is_ascii_lowercase() || *b == b'-' || *b == b' ')
}

fn clip(s: &str) -> String {
    let clipped: String = s.chars().take(40).collect();
    if clipped.len() < s.len() {
        format!("{clipped}…")
    } else {
        clipped
    }
}

/// Everything wrong with the letter files, as read. `files` are the letter
/// files in the order the index lists them, each with its entries; `targets`
/// what a link may point at. Empty when there is nothing wrong.
pub fn validate(files: &[(String, Vec<RawEntry>)], expected_entries: usize, expected_refs: usize, targets: &LinkTargets) -> Vec<String> {
    let mut problems: Vec<String> = Vec::new();
    let mut entries = 0usize;
    let mut refs = 0usize;
    let mut previous_key: Option<&str> = None;
    let mut seen: HashSet<(&str, Option<&str>, &str)> = HashSet::new();
    for (file, list) in files {
        let letter = file.chars().next().unwrap_or('?');
        for (i, e) in list.iter().enumerate() {
            entries += 1;
            let at = format!("{file}#{} ({})", i + 1, if e.key.is_empty() { "no key" } else { &e.key });
            if !is_key(&e.key) {
                problems.push(format!("{at}: the key is not lower-case letters, hyphens and spaces"));
            } else if !e.key.starts_with(letter) {
                problems.push(format!("{at}: filed under {letter}"));
            }
            if e.word.trim().is_empty() {
                problems.push(format!("{at}: no headword"));
            } else if e.word.to_lowercase() != e.key {
                problems.push(format!("{at}: the key is not the headword \"{}\" in lower case", e.word));
            }
            if e.pos.as_deref().is_some_and(|p| p.trim().is_empty()) {
                problems.push(format!("{at}: an empty part of speech (leave it null instead)"));
            }
            if e.text.trim().is_empty() {
                problems.push(format!("{at}: no text"));
            }
            match check_html(&e.html) {
                Err(problem) => problems.push(format!("{at}: {problem}")),
                Ok(links) => {
                    refs += links.len();
                    for osis in &links {
                        if let Err(problem) = check_osis(osis, targets) {
                            problems.push(format!("{at}: {problem}"));
                        }
                    }
                    let paragraphs = e.html.matches("<p>").count();
                    let lines = e.text.lines().count();
                    if !e.text.trim().is_empty() && lines != paragraphs {
                        problems.push(format!("{at}: {lines} line(s) of text for {paragraphs} paragraph(s)"));
                    }
                    if let Some(&beyond) = e.content_paras.iter().find(|&&p| p as usize >= paragraphs) {
                        problems.push(format!("{at}: content_paras names paragraph {beyond} of {paragraphs}"));
                    }
                }
            }
            let mut aliases: HashSet<&str> = HashSet::new();
            for alias in &e.aliases {
                if !is_key(alias) {
                    problems.push(format!("{at}: alias \"{alias}\" is not lower-case letters, hyphens and spaces"));
                } else if alias == &e.key {
                    problems.push(format!("{at}: alias \"{alias}\" is the entry's own key"));
                } else if !aliases.insert(alias) {
                    problems.push(format!("{at}: alias \"{alias}\" is given twice"));
                }
            }
            match (e.from.as_deref(), e.content_paras.is_empty()) {
                (None | Some("content"), true) | (Some("string+content"), false) => {}
                (Some("string+content"), true) => problems.push(format!("{at}: from string+content, but no content_paras")),
                (Some(other), _) if other != "content" => problems.push(format!("{at}: from \"{other}\" is not content or string+content")),
                _ => problems.push(format!("{at}: content_paras without from string+content")),
            }
            if let Some(previous) = previous_key {
                if e.key.as_str() < previous {
                    problems.push(format!("{at}: out of order, after \"{previous}\""));
                }
            }
            previous_key = Some(e.key.as_str());
            if !seen.insert((&e.key, e.pos.as_deref(), &e.html)) {
                problems.push(format!("{at}: the same entry twice"));
            }
        }
    }
    if entries != expected_entries {
        problems.push(format!("{entries} entries, but {INDEX_FILE} counts {expected_entries}"));
    }
    if refs != expected_refs {
        problems.push(format!("{refs} scripture links, but {INDEX_FILE} counts {expected_refs}"));
    }
    problems
}

/// Reads the letter files `_index.json` lists, in its order.
fn read_files(dir: &Path) -> anyhow::Result<(Index, Vec<(String, Vec<RawEntry>)>)> {
    let index_path = dir.join(INDEX_FILE);
    let index: Index = serde_json::from_str(&std::fs::read_to_string(&index_path)?)
        .map_err(|e| anyhow::anyhow!("{} is not in the expected shape: {e}", index_path.display()))?;
    let letters: Vec<String> = ('a'..='z').map(|c| format!("{c}.json")).collect();
    anyhow::ensure!(
        index.files == letters,
        "{INDEX_FILE} lists {:?}; the dictionary is a.json to z.json, one file a letter",
        index.files
    );
    let mut files = Vec::with_capacity(index.files.len());
    for name in &index.files {
        let path = dir.join(name);
        let text = std::fs::read_to_string(&path).map_err(|e| anyhow::anyhow!("{}: {e}", path.display()))?;
        let list: Vec<RawEntry> = serde_json::from_str(&text).map_err(|e| anyhow::anyhow!("{name} is not in the expected shape: {e}"))?;
        files.push((name.clone(), list));
    }
    Ok((index, files))
}

/// Writes checked entries into the tables, numbered from 1 in order. Returns
/// how many entries went in.
fn insert(conn: &mut Connection, files: &[(String, Vec<RawEntry>)]) -> anyhow::Result<usize> {
    let tx = conn.transaction()?;
    let mut count = 0usize;
    {
        let mut entry_stmt =
            tx.prepare("INSERT INTO webster_entries (id, key, sort, word, pos, html, text) VALUES (?1, ?2, ?1, ?3, ?4, ?5, ?6)")?;
        let mut alias_stmt = tx.prepare("INSERT OR IGNORE INTO webster_aliases (alias, entry_id) VALUES (?1, ?2)")?;
        for e in files.iter().flat_map(|(_, list)| list) {
            count += 1;
            let id = count as i64;
            entry_stmt.execute(params![id, e.key, e.word, e.pos, e.html, e.text])?;
            for alias in &e.aliases {
                alias_stmt.execute(params![alias, id])?;
            }
        }
    }
    tx.commit()?;
    Ok(count)
}

pub fn import(conn: &mut Connection, dir: &Path) -> anyhow::Result<usize> {
    let (index, files) = read_files(dir)?;
    let targets = LinkTargets::load(conn)?;
    let problems = validate(&files, index.total_entries, index.total_refs, &targets);
    if !problems.is_empty() {
        let shown = problems.iter().take(PROBLEMS_SHOWN).map(|p| format!("  {p}")).collect::<Vec<_>>().join("\n");
        let more = problems.len().saturating_sub(PROBLEMS_SHOWN);
        anyhow::bail!(
            "{} problem(s) in {}:\n{shown}{}",
            problems.len(),
            dir.display(),
            if more > 0 { format!("\n  ... and {more} more") } else { String::new() }
        );
    }
    insert(conn, &files)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(key: &str, pos: Option<&str>, html: &str, text: &str) -> RawEntry {
        let mut word: String = key.to_string();
        if let Some(first) = word.get_mut(0..1) {
            first.make_ascii_uppercase();
        }
        RawEntry {
            word,
            key: key.to_string(),
            pos: pos.map(str::to_string),
            html: html.to_string(),
            text: text.to_string(),
            aliases: vec![],
            from: None,
            content_paras: vec![],
        }
    }

    /// Psalms and 2 Samuel, as far as the KJV goes: enough to check the
    /// links in PREVENT against.
    fn targets() -> LinkTargets {
        let mut last_verse = HashMap::new();
        last_verse.insert(("Ps".to_string(), 119), 176);
        last_verse.insert(("Ps".to_string(), 59), 17);
        last_verse.insert(("2Sam".to_string(), 22), 51);
        LinkTargets { books: ["Ps", "2Sam", "Job"].iter().map(|s| s.to_string()).collect(), last_verse: Some(last_verse) }
    }

    const PREVENT: &str = "<p><b>PREVENT'</b>, v.t. [L. proevenio, supra.]</p><p>1. To go before; to precede.</p>\
        <p>I prevented the dawning of the morning, and cried. <a class=\"scripref\" data-osis=\"Ps.119.147\">Ps.119</a>.</p>\
        <p><a class=\"scripref\" data-osis=\"2Sam.22.1-2Sam.22.51\">2 Sam.22</a>.</p>";
    const PREVENT_TEXT: &str = "PREVENT, v.t. [L. proevenio, supra.]\n1. To go before; to precede.\n\
        I prevented the dawning of the morning, and cried. Ps.119.\n2 Sam.22.";

    #[test]
    fn an_entry_as_the_script_writes_it_passes_and_gives_up_its_links() {
        assert_eq!(check_html(PREVENT).unwrap(), vec!["Ps.119.147".to_string(), "2Sam.22.1-2Sam.22.51".to_string()]);
        assert_eq!(check_html("<p><b>AND</b>, conj. <i>and</i> &amp;c.</p>").unwrap(), Vec::<String>::new());
        let files = vec![("p.json".to_string(), vec![entry("prevent", Some("v.t."), PREVENT, PREVENT_TEXT)])];
        assert_eq!(validate(&files, 1, 2, &targets()), Vec::<String>::new());
    }

    /// The HTML is written into the page, so anything but the four promised
    /// elements -- or those four misused -- is refused.
    #[test]
    fn markup_the_reader_is_not_promised_is_refused() {
        for bad in [
            "<p>a <script>alert(1)</script></p>",
            "<p>a <a href=\"x\">link</a></p>",
            "<p>a <a class=\"isbe-link\" data-isbe=\"x\">link</a></p>",
            "<p onclick=\"x\">a</p>",
            "<p>a <b>bold</p></b>",
            "<p>a <b>open</p>",
            "<p>one<p>two</p></p>",
            "<p>a</p> stray",
            "loose<p>a</p>",
            "<p>a &nbsp; b</p>",
            "<p>a & b</p>",
            "<p>a > b</p>",
            "<p>a <br> b</p>",
            "<p><a class=\"scripref\" data-osis=\"Ps.1.1\">x <a class=\"scripref\" data-osis=\"Ps.1.2\">y</a></a></p>",
            "<p><a class=\"scripref\" data-osis=\"\">x</a></p>",
            "",
            "<b>a</b>",
        ] {
            assert!(check_html(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn a_link_must_resolve_to_a_verse_the_kjv_has() {
        let t = targets();
        assert!(check_osis("Ps.119.147", &t).is_ok());
        assert!(check_osis("2Sam.22.1-2Sam.22.51", &t).is_ok());
        for bad in [
            "Ps.119",              // a chapter without a verse: not a reference parse_ref_range reads
            "Psalm.119.147",       // a book the app does not know
            "Ps.119.177",          // past the end of the chapter
            "Ps.200.1",            // no such chapter
            "Ps.119.0",            // no verse 0
            "Ps.59.10-Ps.60.2",    // runs into the next chapter
            "Ps.59.10-Job.1.2",    // and into another book
            "Ps.59.10-Ps.59.8",    // backwards
            "Ps.119.147-",         // half a range
        ] {
            assert!(check_osis(bad, &t).is_err(), "{bad}");
        }
        // Without a KJV to check against, the shape and the book still are.
        let bare = LinkTargets { books: t.books.clone(), last_verse: None };
        assert!(check_osis("Ps.200.1", &bare).is_ok());
        assert!(check_osis("Psalm.1.1", &bare).is_err());
    }

    /// Everything wrong is reported together, each problem named with the
    /// file, the entry's place in it, and its key.
    #[test]
    fn every_problem_in_the_files_is_reported_at_once() {
        let mut no_word = entry("pray", Some("v.t."), "<p><b>PRAY</b>, v.t. To ask.</p>", "PRAY, v.t. To ask.");
        no_word.word = String::new();
        let mut wrong_word = entry("prey", Some("n."), "<p><b>PREY</b>, n.</p>", "PREY, n.");
        wrong_word.word = "Pray".into();
        let mut bad_alias = entry("price", None, "<p><b>PRICE</b></p>", "PRICE");
        bad_alias.aliases = vec!["price".into(), "Prize".into()];
        let mut bad_from = entry("prick", None, "<p><b>PRICK</b></p>", "PRICK");
        bad_from.from = Some("string+content".into());
        let files = vec![
            (
                "p.json".to_string(),
                vec![
                    entry("prevent", Some("v.t."), PREVENT, PREVENT_TEXT),
                    entry("pray", Some("v.t."), "<p><b>PRAY</b>, v.t.</p>", "PRAY, v.t."),
                    no_word,
                    wrong_word,
                    bad_alias,
                    bad_from,
                    entry("prim", Some(""), "<p><b>PRIM</b>, a. <i>neat</p>", "PRIM, a."),
                    entry("prime", Some("a."), "<p><b>PRIME</b>, a.</p><p>First in order.</p>", "PRIME, a."),
                    entry("prime", Some("a."), "<p><b>PRIME</b>, a.</p><p>First.</p>", "PRIME, a.\nFirst."),
                    entry("prime", Some("a."), "<p><b>PRIME</b>, a.</p><p>First.</p>", "PRIME, a.\nFirst."),
                    entry("q-tip", None, "<p>Q-TIP</p>", "Q-TIP"),
                    entry("proof", None, "<p>Ps. 119 <a class=\"scripref\" data-osis=\"Ps.119.200\">Ps.119</a></p>", "Ps. 119"),
                ],
            ),
        ];
        let problems = validate(&files, 12, 3, &targets());
        let expect = [
            "p.json#2 (pray): out of order, after \"prevent\"",
            "p.json#3 (pray): no headword",
            "p.json#4 (prey): the key is not the headword \"Pray\" in lower case",
            "p.json#5 (price): alias \"price\" is the entry's own key",
            "p.json#5 (price): alias \"Prize\" is not lower-case letters",
            "p.json#6 (prick): from string+content, but no content_paras",
            "p.json#7 (prim): an empty part of speech",
            "p.json#7 (prim): </p> closes <i>",
            "p.json#8 (prime): 1 line(s) of text for 2 paragraph(s)",
            "p.json#10 (prime): the same entry twice",
            "p.json#11 (q-tip): filed under p",
            "p.json#12 (proof): \"Ps.119.200\": Ps 119 ends at verse 176",
            "p.json#12 (proof): out of order, after \"q-tip\"",
        ];
        for e in expect {
            assert!(problems.iter().any(|p| p.starts_with(e)), "missing: {e}\nin: {problems:#?}");
        }
        assert_eq!(problems.len(), expect.len(), "{problems:#?}");
        // The index's counts are held to what the files hold.
        let counted = validate(&files, 11, 2, &targets());
        assert!(counted.iter().any(|p| p == "12 entries, but _index.json counts 11"), "{counted:#?}");
        assert!(counted.iter().any(|p| p == "3 scripture links, but _index.json counts 2"), "{counted:#?}");
    }

    /// Entries are numbered in file order, homographs apart, and an alias
    /// points at the entry that carries it.
    #[test]
    fn entries_go_in_numbered_in_order_with_their_aliases() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(crate::db::schema::CONTENT_MIGRATION_0028).unwrap();
        let mut amongst = entry("amongst", Some("prep."), "<p><b>AMONGST</b>, prep.</p>", "AMONGST, prep.");
        amongst.aliases = vec!["among".into()];
        let files = vec![
            ("a.json".to_string(), vec![amongst]),
            (
                "l.json".to_string(),
                vec![
                    entry("let", Some("v.t."), "<p><b>LET</b>, v.t.</p>", "LET, v.t."),
                    entry("let", Some("n."), "<p><b>LET</b>, n. A hinderance.</p>", "LET, n. A hinderance."),
                ],
            ),
        ];
        assert_eq!(insert(&mut conn, &files).unwrap(), 3);
        let rows: Vec<(i64, i64, String, Option<String>)> = conn
            .prepare("SELECT id, sort, key, pos FROM webster_entries ORDER BY sort")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            rows,
            vec![
                (1, 1, "amongst".to_string(), Some("prep.".to_string())),
                (2, 2, "let".to_string(), Some("v.t.".to_string())),
                (3, 3, "let".to_string(), Some("n.".to_string())),
            ]
        );
        let alias: i64 = conn.query_row("SELECT entry_id FROM webster_aliases WHERE alias = 'among'", [], |r| r.get(0)).unwrap();
        assert_eq!(alias, 1);
        // The index is filled by the trigger, stemmed: "hinderances" finds LET the noun.
        let found: i64 = conn
            .query_row("SELECT rowid FROM webster_fts WHERE webster_fts MATCH 'hinderances'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(found, 3);
    }
}
