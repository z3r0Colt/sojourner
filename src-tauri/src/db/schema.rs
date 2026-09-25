// Schema is split across two physical database files (see db/mod.rs):
//
//   content.db -- read-mostly, ships with the app: canon/book metadata,
//   translations, verse text, commentaries, lexicon, dictionary,
//   cross-references, interlinear/morphology, footnotes, Westminster
//   Standards + their commentaries. Built ahead of time by the
//   `build_content_db` binary and shipped as a bundled resource; see
//   CONTENT_MIGRATIONS.
//
//   user.db -- writable, per-install: highlights, notes, bookmarks,
//   passage links, reading position, settings, the user's resource library
//   (epub/pdf/mobi/audio/video) and its passage/resource links. See
//   USER_MIGRATIONS.
//
// The runtime connection opens user.db as its `main` schema and ATTACHes
// content.db as `content`. Table names never collide between the two files,
// so every existing unqualified query (`SELECT ... FROM verses JOIN books`)
// keeps resolving correctly -- SQLite falls through to the attached schema
// when `main` has no match for a name. Because of that split, columns in
// user.db that logically reference content.db rows (e.g. `highlights.book_id`)
// are plain integers with no FOREIGN KEY clause: SQLite foreign keys cannot
// span two different database files. Columns referencing another row within
// the *same* file (e.g. `notes.highlight_id` -> `highlights.id`, both in
// user.db) keep their REFERENCES clause and are still enforced.

pub const CONTENT_MIGRATION_0001: &str = r#"
CREATE TABLE books (
  id            INTEGER PRIMARY KEY,
  osis_code     TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  short_name    TEXT NOT NULL,
  testament     TEXT NOT NULL CHECK(testament IN ('OT','NT')),
  chapter_count INTEGER NOT NULL
);

CREATE TABLE translations (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  language      TEXT,
  source_path   TEXT NOT NULL,
  source_format TEXT NOT NULL,
  imported_at   TEXT NOT NULL,
  checksum      TEXT NOT NULL
);

CREATE TABLE verses (
  id             INTEGER PRIMARY KEY,
  translation_id INTEGER NOT NULL REFERENCES translations(id) ON DELETE CASCADE,
  book_id        INTEGER NOT NULL REFERENCES books(id),
  chapter        INTEGER NOT NULL,
  verse          INTEGER NOT NULL,
  text           TEXT NOT NULL,
  UNIQUE(translation_id, book_id, chapter, verse)
);
CREATE INDEX idx_verses_lookup ON verses(translation_id, book_id, chapter, verse);

CREATE VIRTUAL TABLE verses_fts USING fts5(
  text,
  content='verses',
  content_rowid='id',
  tokenize='porter unicode61'
);

CREATE TRIGGER verses_ai AFTER INSERT ON verses BEGIN
  INSERT INTO verses_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER verses_ad AFTER DELETE ON verses BEGIN
  INSERT INTO verses_fts(verses_fts, rowid, text) VALUES('delete', old.id, old.text);
END;
CREATE TRIGGER verses_au AFTER UPDATE ON verses BEGIN
  INSERT INTO verses_fts(verses_fts, rowid, text) VALUES('delete', old.id, old.text);
  INSERT INTO verses_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TABLE commentary_sources (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  author        TEXT,
  source_format TEXT NOT NULL,
  source_files  TEXT NOT NULL,
  imported_at   TEXT NOT NULL
);

CREATE TABLE commentary_books (
  id                    INTEGER PRIMARY KEY,
  commentary_source_id  INTEGER NOT NULL REFERENCES commentary_sources(id) ON DELETE CASCADE,
  book_id               INTEGER NOT NULL REFERENCES books(id),
  div1_id               TEXT,
  UNIQUE(commentary_source_id, book_id)
);

CREATE TABLE commentary_sections (
  id                    INTEGER PRIMARY KEY,
  commentary_source_id  INTEGER NOT NULL REFERENCES commentary_sources(id) ON DELETE CASCADE,
  book_id               INTEGER NOT NULL REFERENCES books(id),
  chapter               INTEGER,
  div2_id               TEXT NOT NULL,
  title                 TEXT,
  sort_order            INTEGER NOT NULL,
  UNIQUE(commentary_source_id, book_id, div2_id)
);
CREATE INDEX idx_commentary_sections_book ON commentary_sections(commentary_source_id, book_id, sort_order);

CREATE TABLE commentary_entries (
  id             INTEGER PRIMARY KEY,
  section_id     INTEGER NOT NULL REFERENCES commentary_sections(id) ON DELETE CASCADE,
  sort_order     INTEGER NOT NULL,
  book_id        INTEGER NOT NULL REFERENCES books(id),
  chapter        INTEGER,
  verse_start    INTEGER,
  verse_end      INTEGER,
  html           TEXT NOT NULL,
  plain_text     TEXT NOT NULL
);
CREATE INDEX idx_commentary_lookup ON commentary_entries(book_id, chapter, verse_start, verse_end);
CREATE INDEX idx_commentary_entries_section ON commentary_entries(section_id);

CREATE VIRTUAL TABLE commentary_fts USING fts5(
  plain_text,
  content='commentary_entries',
  content_rowid='id',
  tokenize='porter unicode61'
);

CREATE TRIGGER commentary_entries_ai AFTER INSERT ON commentary_entries BEGIN
  INSERT INTO commentary_fts(rowid, plain_text) VALUES (new.id, new.plain_text);
END;
CREATE TRIGGER commentary_entries_ad AFTER DELETE ON commentary_entries BEGIN
  INSERT INTO commentary_fts(commentary_fts, rowid, plain_text) VALUES('delete', old.id, old.plain_text);
END;
CREATE TRIGGER commentary_entries_au AFTER UPDATE ON commentary_entries BEGIN
  INSERT INTO commentary_fts(commentary_fts, rowid, plain_text) VALUES('delete', old.id, old.plain_text);
  INSERT INTO commentary_fts(rowid, plain_text) VALUES (new.id, new.plain_text);
END;

CREATE TABLE strongs_entries (
  id                TEXT PRIMARY KEY,
  language          TEXT NOT NULL CHECK(language IN ('hebrew','greek')),
  original_word     TEXT NOT NULL,
  transliteration   TEXT,
  pronunciation     TEXT,
  short_definition  TEXT,
  definition        TEXT NOT NULL,
  derivation        TEXT,
  kjv_usage         TEXT
);

CREATE VIRTUAL TABLE strongs_fts USING fts5(
  original_word, transliteration, definition, kjv_usage,
  content='strongs_entries', content_rowid='rowid'
);
CREATE TRIGGER strongs_ai AFTER INSERT ON strongs_entries BEGIN
  INSERT INTO strongs_fts(rowid, original_word, transliteration, definition, kjv_usage)
  VALUES (new.rowid, new.original_word, new.transliteration, new.definition, new.kjv_usage);
END;

CREATE TABLE dictionary_entries (
  id    INTEGER PRIMARY KEY,
  term  TEXT NOT NULL,
  slug  TEXT NOT NULL UNIQUE,
  body  TEXT NOT NULL
);
CREATE VIRTUAL TABLE dictionary_fts USING fts5(
  term, body, content='dictionary_entries', content_rowid='id'
);
CREATE TRIGGER dictionary_ai AFTER INSERT ON dictionary_entries BEGIN
  INSERT INTO dictionary_fts(rowid, term, body) VALUES (new.id, new.term, new.body);
END;

CREATE TABLE interlinear_words (
  id          INTEGER PRIMARY KEY,
  book_id     INTEGER NOT NULL REFERENCES books(id),
  chapter     INTEGER NOT NULL,
  verse       INTEGER NOT NULL,
  sort_order  INTEGER NOT NULL,
  text        TEXT NOT NULL,
  strongs_id  TEXT
);
CREATE INDEX idx_interlinear_lookup ON interlinear_words(book_id, chapter, verse, sort_order);

CREATE TABLE cross_references (
  id              INTEGER PRIMARY KEY,
  from_book_id    INTEGER NOT NULL REFERENCES books(id),
  from_chapter    INTEGER NOT NULL,
  from_verse      INTEGER NOT NULL,
  to_book_id      INTEGER NOT NULL REFERENCES books(id),
  to_chapter      INTEGER NOT NULL,
  to_verse_start  INTEGER NOT NULL,
  to_verse_end    INTEGER NOT NULL,
  votes           INTEGER NOT NULL
);
CREATE INDEX idx_xref_from ON cross_references(from_book_id, from_chapter, from_verse, votes);

CREATE TABLE westminster_documents (
  id    INTEGER PRIMARY KEY,
  code  TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL
);

CREATE TABLE westminster_sections (
  id                INTEGER PRIMARY KEY,
  document_id       INTEGER NOT NULL REFERENCES westminster_documents(id) ON DELETE CASCADE,
  sort_order        INTEGER NOT NULL,
  heading           TEXT NOT NULL,
  prompt            TEXT,
  body              TEXT NOT NULL,
  body_with_proofs  TEXT NOT NULL
);
CREATE VIRTUAL TABLE westminster_fts USING fts5(
  heading, prompt, body, content='westminster_sections', content_rowid='id'
);
CREATE TRIGGER westminster_ai AFTER INSERT ON westminster_sections BEGIN
  INSERT INTO westminster_fts(rowid, heading, prompt, body) VALUES (new.id, new.heading, new.prompt, new.body);
END;

CREATE TABLE westminster_proofs (
  id          INTEGER PRIMARY KEY,
  section_id  INTEGER NOT NULL REFERENCES westminster_sections(id) ON DELETE CASCADE,
  marker      INTEGER NOT NULL,
  sort_order  INTEGER NOT NULL,
  book_id     INTEGER NOT NULL REFERENCES books(id),
  chapter     INTEGER NOT NULL,
  verse_start INTEGER NOT NULL,
  verse_end   INTEGER NOT NULL
);
CREATE INDEX idx_westminster_proofs_section ON westminster_proofs(section_id, marker);

CREATE TABLE morphology_words (
  id            INTEGER PRIMARY KEY,
  book_id       INTEGER NOT NULL REFERENCES books(id),
  chapter       INTEGER NOT NULL,
  verse         INTEGER NOT NULL,
  sort_order    INTEGER NOT NULL,
  original_word TEXT NOT NULL,
  lemma         TEXT,
  morph_code    TEXT,
  strongs_id    TEXT
);
CREATE INDEX idx_morphology_lookup ON morphology_words(book_id, chapter, verse, sort_order);

CREATE TABLE footnotes (
  id             INTEGER PRIMARY KEY,
  translation_id INTEGER NOT NULL REFERENCES translations(id) ON DELETE CASCADE,
  book_id        INTEGER NOT NULL REFERENCES books(id),
  chapter        INTEGER NOT NULL,
  verse          INTEGER NOT NULL,
  sort_order     INTEGER NOT NULL,
  marker         TEXT NOT NULL,
  text           TEXT NOT NULL,
  char_offset    INTEGER
);
CREATE INDEX idx_footnotes_lookup ON footnotes(translation_id, book_id, chapter, verse);

-- A translation's own (chapter, verse) numbering for a verse maps to
-- (canonical_chapter, canonical_verse) in the traditional/KJV reference
-- scheme. Populated from ground-truth markers some digitizations embed at
-- exactly the points where their versification diverges (see zefania.rs's
-- VERSIFICATION_MARKER) -- e.g. Webster's Bible numbering a Psalm
-- superscription as its own verse, or following the Hebrew 4-chapter
-- division of Joel rather than the traditional 3-chapter one. A verse with
-- no row here has identical (chapter, verse) in both schemes -- true for
-- the overwhelming majority of verses in every bundled translation, so this
-- table only needs rows where they actually differ, not the full 31,000+
-- verses per translation.
CREATE TABLE versification_map (
  id                 INTEGER PRIMARY KEY,
  translation_id     INTEGER NOT NULL REFERENCES translations(id) ON DELETE CASCADE,
  book_id            INTEGER NOT NULL REFERENCES books(id),
  chapter            INTEGER NOT NULL,
  verse              INTEGER NOT NULL,
  canonical_chapter  INTEGER NOT NULL,
  canonical_verse    INTEGER NOT NULL,
  UNIQUE(translation_id, book_id, chapter, verse)
);
CREATE INDEX idx_versification_map_canonical ON versification_map(translation_id, book_id, canonical_chapter, canonical_verse);

-- The 1650 Scottish Metrical Psalter, toggleable alongside the Psalms text
-- in the Reading view. `psalm` is the standard (KJV-reference) Psalm number;
-- `verse` is that version's own stanza number, which sometimes combines more
-- than one Bible verse into a single metrical stanza (a normal, deliberate
-- feature of metrical psalmody, not a mapping to fix) -- so it's a display
-- ordinal, not a versification_map target. A handful of psalms (e.g. 100)
-- carry two traditional metrical settings, distinguished by `version_label`.
CREATE TABLE metrical_psalms (
  id             INTEGER PRIMARY KEY,
  psalm          INTEGER NOT NULL,
  version_label  TEXT,
  verse          INTEGER NOT NULL,
  text           TEXT NOT NULL,
  UNIQUE(psalm, version_label, verse)
);
CREATE INDEX idx_metrical_psalms_lookup ON metrical_psalms(psalm, version_label, verse);

-- A book's own name/short-name as a given translation's source labels it,
-- captured whenever it differs from the canonical name in `books` (e.g.
-- Douay-Rheims' "Josue" for Joshua, "1 Kings" for our "1 Samuel",
-- "Paralipomenon" for Chronicles). Used to resolve the book/chapter picker
-- and the Go To command palette against whichever naming the user types or
-- currently has selected.
CREATE TABLE book_aliases (
  id             INTEGER PRIMARY KEY,
  translation_id INTEGER NOT NULL REFERENCES translations(id) ON DELETE CASCADE,
  book_id        INTEGER NOT NULL REFERENCES books(id),
  name           TEXT NOT NULL,
  short_name     TEXT,
  UNIQUE(translation_id, book_id)
);
CREATE INDEX idx_book_aliases_book ON book_aliases(book_id);

CREATE TABLE westminster_commentary_sources (
  id      INTEGER PRIMARY KEY,
  code    TEXT NOT NULL UNIQUE,
  title   TEXT NOT NULL,
  author  TEXT
);

CREATE TABLE westminster_commentary_entries (
  id          INTEGER PRIMARY KEY,
  source_id   INTEGER NOT NULL REFERENCES westminster_commentary_sources(id) ON DELETE CASCADE,
  chapter     INTEGER NOT NULL,
  section     INTEGER,
  sort_order  INTEGER NOT NULL,
  body        TEXT NOT NULL
);
CREATE INDEX idx_wcc_entries_lookup ON westminster_commentary_entries(source_id, chapter, sort_order);

INSERT INTO books (id, osis_code, name, short_name, testament, chapter_count) VALUES
(1,'Gen','Genesis','Gen','OT',50),
(2,'Exod','Exodus','Exo','OT',40),
(3,'Lev','Leviticus','Lev','OT',27),
(4,'Num','Numbers','Num','OT',36),
(5,'Deut','Deuteronomy','Deu','OT',34),
(6,'Josh','Joshua','Jos','OT',24),
(7,'Judg','Judges','Jdg','OT',21),
(8,'Ruth','Ruth','Rth','OT',4),
(9,'1Sam','1 Samuel','1Sa','OT',31),
(10,'2Sam','2 Samuel','2Sa','OT',24),
(11,'1Kgs','1 Kings','1Ki','OT',22),
(12,'2Kgs','2 Kings','2Ki','OT',25),
(13,'1Chr','1 Chronicles','1Ch','OT',29),
(14,'2Chr','2 Chronicles','2Ch','OT',36),
(15,'Ezra','Ezra','Ezr','OT',10),
(16,'Neh','Nehemiah','Neh','OT',13),
(17,'Esth','Esther','Est','OT',10),
(18,'Job','Job','Job','OT',42),
(19,'Ps','Psalms','Psa','OT',150),
(20,'Prov','Proverbs','Pro','OT',31),
(21,'Eccl','Ecclesiastes','Ecc','OT',12),
(22,'Song','Song of Solomon','Sng','OT',8),
(23,'Isa','Isaiah','Isa','OT',66),
(24,'Jer','Jeremiah','Jer','OT',52),
(25,'Lam','Lamentations','Lam','OT',5),
(26,'Ezek','Ezekiel','Eze','OT',48),
(27,'Dan','Daniel','Dan','OT',12),
(28,'Hos','Hosea','Hos','OT',14),
(29,'Joel','Joel','Joe','OT',3),
(30,'Amos','Amos','Amo','OT',9),
(31,'Obad','Obadiah','Oba','OT',1),
(32,'Jonah','Jonah','Jon','OT',4),
(33,'Mic','Micah','Mic','OT',7),
(34,'Nah','Nahum','Nah','OT',3),
(35,'Hab','Habakkuk','Hab','OT',3),
(36,'Zeph','Zephaniah','Zep','OT',3),
(37,'Hag','Haggai','Hag','OT',2),
(38,'Zech','Zechariah','Zec','OT',14),
(39,'Mal','Malachi','Mal','OT',4),
(40,'Matt','Matthew','Mat','NT',28),
(41,'Mark','Mark','Mar','NT',16),
(42,'Luke','Luke','Luk','NT',24),
(43,'John','John','Jhn','NT',21),
(44,'Acts','Acts','Act','NT',28),
(45,'Rom','Romans','Rom','NT',16),
(46,'1Cor','1 Corinthians','1Co','NT',16),
(47,'2Cor','2 Corinthians','2Co','NT',13),
(48,'Gal','Galatians','Gal','NT',6),
(49,'Eph','Ephesians','Eph','NT',6),
(50,'Phil','Philippians','Phi','NT',4),
(51,'Col','Colossians','Col','NT',4),
(52,'1Thess','1 Thessalonians','1Th','NT',5),
(53,'2Thess','2 Thessalonians','2Th','NT',3),
(54,'1Tim','1 Timothy','1Ti','NT',6),
(55,'2Tim','2 Timothy','2Ti','NT',4),
(56,'Titus','Titus','Tit','NT',3),
(57,'Phlm','Philemon','Phm','NT',1),
(58,'Heb','Hebrews','Heb','NT',13),
(59,'Jas','James','Jas','NT',5),
(60,'1Pet','1 Peter','1Pe','NT',5),
(61,'2Pet','2 Peter','2Pe','NT',3),
(62,'1John','1 John','1Jn','NT',5),
(63,'2John','2 John','2Jn','NT',1),
(64,'3John','3 John','3Jn','NT',1),
(65,'Jude','Jude','Jud','NT',1),
(66,'Rev','Revelation','Rev','NT',22);
"#;

// Reading plans: a plan (M'Cheyne, straight-through canonical, 90-Day Bible,
// ...) is a fixed sequence of days, each with one or more readings. A
// reading's `chapter_start`/`verse_start` .. `chapter_end`/`verse_end` can
// span more than one chapter (M'Cheyne's "Exodus 11:1-12:20"); a null verse
// bound means "from/to the start/end of that chapter" (the common case: a
// reading of one or more whole chapters). Plans ship as bundled content and
// are the same for every install; a user's progress through one lives in
// user.db (see reading_plan_progress/reading_plan_completions).
pub const CONTENT_MIGRATION_0002: &str = r#"
CREATE TABLE reading_plans (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  description   TEXT,
  length_days   INTEGER NOT NULL
);

CREATE TABLE reading_plan_readings (
  id             INTEGER PRIMARY KEY,
  plan_id        INTEGER NOT NULL REFERENCES reading_plans(id) ON DELETE CASCADE,
  day_number     INTEGER NOT NULL,
  sort_order     INTEGER NOT NULL,
  book_id        INTEGER NOT NULL REFERENCES books(id),
  chapter_start  INTEGER NOT NULL,
  verse_start    INTEGER,
  chapter_end    INTEGER NOT NULL,
  verse_end      INTEGER,
  label          TEXT NOT NULL
);
CREATE INDEX idx_reading_plan_readings_day ON reading_plan_readings(plan_id, day_number, sort_order);
"#;

// A harmony of the Gospels: a fixed, chronologically-ordered sequence of
// events in the life of Christ, each paired with where it's told across
// Matthew/Mark/Luke/John (and, for the ascension, Acts 1). Same
// chapter/verse-range shape as reading_plan_readings, for the same reason --
// a reading can span chapters (John 2:23-3:21) or, rarely, be one of several
// disjoint verse ranges within a single event (John 1:6-14 and 1:19-34 are
// two separate `harmony_readings` rows under one section).
pub const CONTENT_MIGRATION_0003: &str = r#"
CREATE TABLE harmony_sections (
  id          INTEGER PRIMARY KEY,
  sort_order  INTEGER NOT NULL,
  title       TEXT NOT NULL
);

CREATE TABLE harmony_readings (
  id             INTEGER PRIMARY KEY,
  section_id     INTEGER NOT NULL REFERENCES harmony_sections(id) ON DELETE CASCADE,
  sort_order     INTEGER NOT NULL,
  book_id        INTEGER NOT NULL REFERENCES books(id),
  chapter_start  INTEGER NOT NULL,
  verse_start    INTEGER,
  chapter_end    INTEGER NOT NULL,
  verse_end      INTEGER,
  label          TEXT NOT NULL
);
CREATE INDEX idx_harmony_readings_section ON harmony_readings(section_id, sort_order);
"#;

// Verse ranges containing the words of Jesus, for the reading view's
// red-letter toggle. Translation-agnostic (chapter/verse offsets, not any
// one translation's own wording), so the same ranges apply to every bundled
// translation -- see reference/red_letter/red_letter.json for provenance.
pub const CONTENT_MIGRATION_0004: &str = r#"
CREATE TABLE red_letter_ranges (
  id           INTEGER PRIMARY KEY,
  book_id      INTEGER NOT NULL REFERENCES books(id),
  chapter      INTEGER NOT NULL,
  verse_start  INTEGER NOT NULL,
  verse_end    INTEGER NOT NULL
);
CREATE INDEX idx_red_letter_lookup ON red_letter_ranges(book_id, chapter);
"#;

// A commentary on one of the three Westminster Standards is scoped to
// whichever of them it comments on -- Hodge and Shaw both comment on the WCF
// (33 chapters), Vincent on the WSC (107 questions) -- so the numbering in
// westminster_commentary_entries.chapter only means the same thing as
// another source's numbering when both share a document_code. Without this,
// the UI has no way to know Vincent's "chapter 5" is WSC Question 5, not
// WCF Chapter 5, and could offer it as a commentary option on the wrong
// document entirely.
pub const CONTENT_MIGRATION_0005: &str = r#"
ALTER TABLE westminster_commentary_sources ADD COLUMN document_code TEXT;
"#;

// Thayer's Greek-English Lexicon of the New Testament entries, keyed by the
// same Strong's Greek id used throughout the app (strongs_entries.id) so the
// lexicon popup/view can show it alongside (not instead of) the terser
// Strong's gloss -- Thayer's is the much longer, scholarly definition.
// One row per Strong's number; no FOREIGN KEY needed since both tables live
// in content.db and are populated by the same reference import pass.
pub const CONTENT_MIGRATION_0006: &str = r#"
CREATE TABLE thayers_entries (
  strongs_id  TEXT PRIMARY KEY,
  definition  TEXT NOT NULL
);
"#;

// Thayer's was originally imported as flat plain text (see migration 0006).
// The real source data is richly marked up (bold Greek headwords, clickable
// scripture refs), so it's now rendered the same way commentary_entries is:
// a small sanitized HTML string for display, plus a plain-text rendition for
// any future FTS/search use. `definition` is dropped in favor of these two.
pub const CONTENT_MIGRATION_0007: &str = r#"
ALTER TABLE thayers_entries RENAME COLUMN definition TO plain_text;
ALTER TABLE thayers_entries ADD COLUMN html TEXT NOT NULL DEFAULT '';
"#;

// A confession/catechism proof-text marker already records the exact
// (book_id, chapter, verse_start, verse_end) it cites -- see
// westminster_proofs in CONTENT_MIGRATION_0001 -- but the only existing
// index is section-first, for rendering a section's own proof list. This
// adds the reverse direction: given a passage the user is reading, find
// every Standards paragraph that cites it as a proof. No new table, since
// the data already exists; just an index shaped for that lookup.
pub const CONTENT_MIGRATION_0008: &str = r#"
CREATE INDEX idx_westminster_proofs_passage ON westminster_proofs(book_id, chapter, verse_start, verse_end);
"#;

// Translation-transparency flag: every translation the app ships is true
// public domain, and this column exists so one a *reader* imports is not
// silently presented as though it were.
//
// It was written for a different situation. NASB 1995, NKJV 1982 and NLT
// 1996 were once bundled and marked 'licensed' on the strength of a licence
// that did not exist; they have since been removed from `bibles/`, and
// `import::refuse_licensed_translations` fails the build if one returns.
// What is left is the honest case: a reader with their own licensed copy
// imports it through "Add File…", and the Library settings page marks it.
//
// Default 'public_domain' covers the common case; the importer backfills
// 'licensed' for the known non-PD codes right after import (see
// import::mod::backfill_license_status) so this never has to be
// hand-maintained per translation file.
pub const CONTENT_MIGRATION_0009: &str = r#"
ALTER TABLE translations ADD COLUMN license_status TEXT NOT NULL DEFAULT 'public_domain';
"#;

// A curated topical index drawing on the Standards' own structure -- the 33
// WCF chapter titles ("Of Justification," "Of the Sabbath," etc.) plus a
// broader set of WSC-question-derived topics for doctrines the Confession's
// chapter list alone doesn't surface at that grain (each Ten Commandments
// entry, the specific offices of Christ, and so on) -- rather than a modern
// topical-Bible taxonomy of uncertain provenance. `category` groups topics
// for browsing along traditional systematic-theology lines (Scripture,
// God, Christ, salvation applied, the law, the church, last things);
// `sort_order` is insertion order within that grouping, not alphabetical.
// `westminster_section_id` points at the specific paragraph/question the
// topic is anchored to (a WCF chapter's first section, or one exact WSC
// question) as the jump target. Seeded at import time once
// westminster_sections exists (see import::reference::doctrine_topics),
// not shipped as static data here, since it needs that table's real ids.
pub const CONTENT_MIGRATION_0010: &str = r#"
CREATE TABLE doctrine_topics (
  id                      INTEGER PRIMARY KEY,
  name                    TEXT NOT NULL,
  category                TEXT NOT NULL,
  sort_order              INTEGER NOT NULL,
  westminster_section_id  INTEGER NOT NULL REFERENCES westminster_sections(id)
);
CREATE INDEX idx_doctrine_topics_category ON doctrine_topics(category, sort_order);
"#;

// The shipped library: the books that travel with the app itself (see
// `crate::library`), as against the ones a reader adds afterwards, which stay
// in user.db. Only what is *read* lives here -- a title, an author, and the
// words, extracted at package time so a fresh install can search a hundred
// volumes the moment it opens. The files themselves are bundled beside the
// executable and never copied into the reader's own folder; `file_name` is
// how a row finds its file there.
//
// user.db keeps a small row per book all the same (`resources.library_key`),
// because tags, passage links, and reading positions all reference
// `resources(id)` and a shipped book must be taggable like any other.
pub const CONTENT_MIGRATION_0011: &str = r#"
CREATE TABLE library_resources (
  id              INTEGER PRIMARY KEY,
  file_name       TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL,
  title           TEXT NOT NULL,
  author          TEXT,
  extracted_text  TEXT
);
CREATE VIRTUAL TABLE library_fts USING fts5(
  title, author, extracted_text, content='library_resources', content_rowid='id'
);
CREATE TRIGGER library_ai AFTER INSERT ON library_resources BEGIN
  INSERT INTO library_fts(rowid, title, author, extracted_text)
  VALUES (new.id, new.title, new.author, new.extracted_text);
END;
CREATE TRIGGER library_au AFTER UPDATE ON library_resources BEGIN
  INSERT INTO library_fts(library_fts, rowid, title, author, extracted_text)
  VALUES('delete', old.id, old.title, old.author, old.extracted_text);
  INSERT INTO library_fts(rowid, title, author, extracted_text)
  VALUES (new.id, new.title, new.author, new.extracted_text);
END;
CREATE TRIGGER library_ad AFTER DELETE ON library_resources BEGIN
  INSERT INTO library_fts(library_fts, rowid, title, author, extracted_text)
  VALUES('delete', old.id, old.title, old.author, old.extracted_text);
END;
"#;

// The encyclopedia (ISBE, 1915) and the atlas.
//
// `isbe_entries.body` is HTML rather than plain text, because the source
// already tags every scripture citation and every cross-reference to another
// article. Keeping that markup means the reader gets clickable references for
// free from `CommentaryHtml`, instead of the frontend re-finding references
// in prose that had already marked them.
//
// An ISBE key often carries several headwords ("ABGAR; ABGARUS; ABAGARUS")
// or inverts one for alphabetizing ("ABOMINATION, BIRDS OF"). `isbe_aliases`
// holds the other ways in so a search for "Abagarus" or "Birds of
// Abomination" arrives at the article that covers it.
//
// The atlas's `atlas_place_verses` is the spine of the whole feature: it is
// what turns "where is Thessalonica" into "what is on the map in Acts 17",
// which is the question a reader actually has while reading.
pub const CONTENT_MIGRATION_0012: &str = r#"
CREATE TABLE isbe_entries (
  id            INTEGER PRIMARY KEY,
  term          TEXT NOT NULL,
  sort_key      TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  body          TEXT NOT NULL,
  plain_text    TEXT NOT NULL,
  redirect_slug TEXT
);
CREATE INDEX idx_isbe_sort ON isbe_entries(sort_key COLLATE NOCASE);

CREATE TABLE isbe_aliases (
  alias    TEXT NOT NULL,
  entry_id INTEGER NOT NULL REFERENCES isbe_entries(id)
);
CREATE INDEX idx_isbe_alias ON isbe_aliases(alias COLLATE NOCASE);

CREATE VIRTUAL TABLE isbe_fts USING fts5(
  term, plain_text, content='isbe_entries', content_rowid='id'
);
CREATE TRIGGER isbe_ai AFTER INSERT ON isbe_entries BEGIN
  INSERT INTO isbe_fts(rowid, term, plain_text) VALUES (new.id, new.term, new.plain_text);
END;
CREATE TRIGGER isbe_au AFTER UPDATE ON isbe_entries BEGIN
  INSERT INTO isbe_fts(isbe_fts, rowid, term, plain_text) VALUES('delete', old.id, old.term, old.plain_text);
  INSERT INTO isbe_fts(rowid, term, plain_text) VALUES (new.id, new.term, new.plain_text);
END;
CREATE TRIGGER isbe_ad AFTER DELETE ON isbe_entries BEGIN
  INSERT INTO isbe_fts(isbe_fts, rowid, term, plain_text) VALUES('delete', old.id, old.term, old.plain_text);
END;

CREATE TABLE atlas_places (
  id                  TEXT PRIMARY KEY,
  slug                TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  article             TEXT,
  kinds               TEXT NOT NULL,
  category            TEXT NOT NULL,
  lon                 REAL,
  lat                 REAL,
  approximate         INTEGER NOT NULL DEFAULT 0,
  confidence          TEXT NOT NULL,
  modern_name         TEXT,
  modern_alternatives INTEGER NOT NULL DEFAULT 0,
  verse_count         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_atlas_places_name ON atlas_places(name COLLATE NOCASE);

CREATE TABLE atlas_place_verses (
  place_id TEXT NOT NULL REFERENCES atlas_places(id),
  book_id  INTEGER NOT NULL REFERENCES books(id),
  chapter  INTEGER NOT NULL,
  verse    INTEGER NOT NULL
);
CREATE INDEX idx_atlas_verses_ref   ON atlas_place_verses(book_id, chapter, verse);
CREATE INDEX idx_atlas_verses_place ON atlas_place_verses(place_id);

CREATE VIRTUAL TABLE atlas_fts USING fts5(
  name, modern_name, content='atlas_places', content_rowid='rowid'
);
CREATE TRIGGER atlas_places_ai AFTER INSERT ON atlas_places BEGIN
  INSERT INTO atlas_fts(rowid, name, modern_name) VALUES (new.rowid, new.name, new.modern_name);
END;
CREATE TRIGGER atlas_places_au AFTER UPDATE ON atlas_places BEGIN
  INSERT INTO atlas_fts(atlas_fts, rowid, name, modern_name) VALUES('delete', old.rowid, old.name, old.modern_name);
  INSERT INTO atlas_fts(rowid, name, modern_name) VALUES (new.rowid, new.name, new.modern_name);
END;
CREATE TRIGGER atlas_places_ad AFTER DELETE ON atlas_places BEGIN
  INSERT INTO atlas_fts(atlas_fts, rowid, name, modern_name) VALUES('delete', old.rowid, old.name, old.modern_name);
END;

CREATE TABLE atlas_journeys (
  id         INTEGER PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  summary    TEXT NOT NULL,
  era        TEXT NOT NULL,
  reference  TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

-- `place_id` is null for a station Scripture names but nobody can now locate
-- (much of the wilderness itinerary is like this). Those legs still belong in
-- the written route, so they are kept and simply not drawn.
CREATE TABLE atlas_journey_legs (
  id         INTEGER PRIMARY KEY,
  journey_id INTEGER NOT NULL REFERENCES atlas_journeys(id),
  sort_order INTEGER NOT NULL,
  place_id   TEXT REFERENCES atlas_places(id),
  label      TEXT NOT NULL,
  note       TEXT,
  book_id    INTEGER REFERENCES books(id),
  chapter    INTEGER,
  verse      INTEGER
);
CREATE INDEX idx_atlas_legs ON atlas_journey_legs(journey_id, sort_order);
"#;

// The dictionary carries two works, and used to lose track of which was
// which: every definition was folded into one `body` string with "(Easton's)"
// typed in front of it, so nothing could show them apart or let a reader pick
// one. `dictionary_definitions` keeps them as what they are -- separate
// articles by separate authors on the same headword.
//
// `dictionary_aliases` exists because the two spell things differently.
// Easton's files "Abel-meholah" and Smith's "Abelmeholah"; 163 headwords were
// split that way, so the index listed a subject twice and each copy held half
// of what the app knew about it. The importer merges them and the spellings
// it did not keep live on here, so searching either one still arrives.
pub const CONTENT_MIGRATION_0013: &str = r#"
ALTER TABLE dictionary_entries ADD COLUMN sources TEXT NOT NULL DEFAULT '';

CREATE TABLE dictionary_definitions (
  id          INTEGER PRIMARY KEY,
  entry_id    INTEGER NOT NULL REFERENCES dictionary_entries(id),
  source_code TEXT NOT NULL,
  source_name TEXT NOT NULL,
  body        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_dictionary_definitions ON dictionary_definitions(entry_id, sort_order);

CREATE TABLE dictionary_aliases (
  alias    TEXT NOT NULL,
  entry_id INTEGER NOT NULL REFERENCES dictionary_entries(id)
);
CREATE INDEX idx_dictionary_alias ON dictionary_aliases(alias COLLATE NOCASE);
"#;

// Which encyclopedia articles discuss a given verse.
//
// ISBE tags every citation it makes -- 93,162 of them, over 24,735 distinct
// verses in all 66 books -- and until now that was only good for making the
// references clickable on the way out. Indexed the other way round it
// answers the question a reader actually has open in front of them: what
// does the encyclopedia say about *this* passage. That turns a work you have
// to know how to search into one that meets you in the text.
//
// `ref_count` is how many references the whole article makes, and it is
// there to rank: "Jesus Christ" cites 1,139 passages and would otherwise
// surface on every chapter in the Bible, ahead of the article actually about
// what you are reading.
pub const CONTENT_MIGRATION_0014: &str = r#"
ALTER TABLE isbe_entries ADD COLUMN ref_count INTEGER NOT NULL DEFAULT 0;

-- `weight` is thousandths of a citation. A citation of one verse puts 1000
-- on that verse; one of "Gen 14:1-24" puts about 42 on each of the
-- twenty-four, so a sweep of a chapter is worth the same as a single precise
-- reference rather than twenty-four times as much. Without that, an article
-- that mentions a chapter in passing outranks the article the chapter is
-- about: "Archaeology" cites Genesis 14 whole seven times and would bury
-- "Melchizedek", which cites 14:18 five times and is the reason anyone opens
-- that chapter.
CREATE TABLE isbe_refs (
  entry_id INTEGER NOT NULL REFERENCES isbe_entries(id),
  book_id  INTEGER NOT NULL REFERENCES books(id),
  chapter  INTEGER NOT NULL,
  verse    INTEGER NOT NULL,
  weight   INTEGER NOT NULL DEFAULT 1000
);
CREATE INDEX idx_isbe_refs_passage ON isbe_refs(book_id, chapter, verse);
CREATE INDEX idx_isbe_refs_entry ON isbe_refs(entry_id);
"#;

// How to say the names.
//
// Read aloud has always had a second problem behind the voice: no synthesizer
// knows what to do with Mephibosheth, and a genealogy chapter read by one is
// unlistenable. The fix was already sitting in the encyclopedia. ISBE opens
// almost every article with the 1915 edition's pronunciation respelling --
// "me-fib'-o-sheth", "ze-rub'-a-bel", "ar-e-op'-a-gus" -- roughly seven
// thousand of them, covering the proper nouns of Scripture far better than
// any list that could be written by hand. They were imported as part of the
// article body and never read as data.
//
// The respelling is stored raw, exactly as ISBE gives it. Turning one into
// something a particular voice says correctly is a matter of taste that will
// be adjusted by ear, and that belongs in the frontend where it costs nothing
// to change -- not baked in here, where every adjustment would mean rebuilding
// content.db.
pub const CONTENT_MIGRATION_0015: &str = r#"
CREATE TABLE pronunciations (
  word       TEXT PRIMARY KEY,   -- the headword, uppercased: "MEPHIBOSHETH"
  respelling TEXT NOT NULL,      -- ISBE's own form: "me-fib'-o-sheth"
  source     TEXT NOT NULL       -- 'isbe'; room for a curated second source
);
"#;

// The psalter as something to sing rather than only to read.
//
// `metrical_psalms` holds the running verse text and stays as it was. What
// this adds is the shape a psalter is actually printed in: each setting knows
// its metre, and -- where the scan was clean enough to divide exactly -- its
// stanzas broken into metrical lines, one line per line of the tune.
//
// A tune belongs to a metre, not to a psalm. Any Common Metre tune carries
// any Common Metre psalm, which is the whole point of naming metres, so tunes
// are stored once and matched to psalms by `metre`.
pub const CONTENT_MIGRATION_0016: &str = r#"
CREATE TABLE metrical_psalm_settings (
  id       INTEGER PRIMARY KEY,
  psalm    INTEGER NOT NULL,
  label    TEXT,               -- 'First Version' where the book prints two
  metre    TEXT NOT NULL,      -- 'C.M.', 'L.M.', '8.7.8.7.'
  pattern  TEXT NOT NULL,      -- syllables per line: '8,6,8,6'
  UNIQUE(psalm, label)
);
CREATE INDEX idx_metrical_psalm_settings_psalm ON metrical_psalm_settings(psalm);

-- One line of one stanza. `marks` is JSON, [{"verse":2,"word":0}], naming the
-- Bible verses that begin inside this line -- in metrical psalmody a verse
-- regularly begins mid-line, so the number cannot simply sit at the front.
-- `syllables` is JSON, one entry per note the line is sung on, with longer
-- words already divided ("sal","va","ti","on") -- so the words can be set
-- under the notes without the two drifting apart.
CREATE TABLE metrical_psalm_lines (
  id          INTEGER PRIMARY KEY,
  setting_id  INTEGER NOT NULL REFERENCES metrical_psalm_settings(id),
  stanza      INTEGER NOT NULL,
  line        INTEGER NOT NULL,
  text        TEXT NOT NULL,
  marks       TEXT NOT NULL DEFAULT '[]',
  syllables   TEXT NOT NULL DEFAULT '[]',
  UNIQUE(setting_id, stanza, line)
);

-- `notes` is JSON: an array of lines, each an array of syllables, each an
-- array of {"midi":67,"beats":1}. A syllable is usually one note and
-- occasionally two, where the tune carries it -- so the words can be set
-- under the notes without the two drifting apart.
CREATE TABLE psalm_tunes (
  id        TEXT PRIMARY KEY,   -- 'st-anne'
  name      TEXT NOT NULL,
  metre     TEXT NOT NULL,
  pattern   TEXT NOT NULL,
  composer  TEXT,
  tune_key  TEXT,
  tempo     INTEGER NOT NULL,   -- crotchets per minute
  notes     TEXT NOT NULL
);
CREATE INDEX idx_psalm_tunes_metre ON psalm_tunes(metre);
"#;

// More than one harmony of the Gospels, and the prose each of them was
// written with.
//
// CONTENT_MIGRATION_0003 assumed a single harmony -- `harmony_sections` had
// nowhere to say which harmony a section belonged to, so a second one could
// not be imported alongside the first. This gives harmonies the same shape
// reading_plans has had since CONTENT_MIGRATION_0002: a parent row keyed by
// `code`, with everything else hanging off it.
//
// Harmonists disagree, which is the point of having more than one. They
// divide the life of Christ differently (136 events against Robertson's
// 185), date the same event differently, and order the Perean ministry
// differently again. Nothing here tries to reconcile them: each harmony
// keeps its own sections, its own divisions, and its own reasoning.
//
// What a harmony carries besides the table:
//
//   `harmony_parts`  -- the periods a harmony groups its sections into
//       (Robertson's fourteen: the Great Galilean Ministry, In the Shadow
//       with Jesus, ...). Optional; a flat harmony has none.
//   `headnote`       -- the place and approximate date printed under a
//       section title ("Bethany beyond Jordan. Probably A.D. 26"). Kept as
//       the one line the harmonist wrote rather than split into columns,
//       because the two halves are not reliably separable and often only
//       one of them is offered.
//   `number`         -- the harmony's own label for the section, which is
//       not always the ordinal: Robertson splits his §128 into 128a and
//       128b, so 184 numbers cover 185 sections.
//   `harmony_section_notes` -- the harmonist's footnotes on a section.
//   `harmony_essays` -- longer discussions of the hard cases, which those
//       footnotes point into by number (Robertson's fourteen "Explanatory
//       Notes on Points of Special Difficulty": the two genealogies, the
//       date of the Nativity, whether Christ ate the Passover, the hour of
//       the crucifixion).
//
// `harmony_id` is added nullable because SQLite cannot add a NOT NULL
// reference to a table that already has rows; the importer sets it on every
// row it writes, and it re-imports both harmonies from scratch when it finds
// `harmonies` empty (see import::reference::harmony).
pub const CONTENT_MIGRATION_0017: &str = r#"
CREATE TABLE harmonies (
  id           INTEGER PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  author       TEXT,
  year         INTEGER,
  description  TEXT,
  source_note  TEXT,            -- edition and provenance, shown in the app
  sort_order   INTEGER NOT NULL
);

CREATE TABLE harmony_parts (
  id          INTEGER PRIMARY KEY,
  harmony_id  INTEGER NOT NULL REFERENCES harmonies(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL,
  label       TEXT,             -- 'Part VII', where the harmony numbers them
  title       TEXT NOT NULL
);
CREATE INDEX idx_harmony_parts_harmony ON harmony_parts(harmony_id, sort_order);

ALTER TABLE harmony_sections ADD COLUMN harmony_id INTEGER REFERENCES harmonies(id);
ALTER TABLE harmony_sections ADD COLUMN part_id    INTEGER REFERENCES harmony_parts(id);
ALTER TABLE harmony_sections ADD COLUMN number     TEXT;
ALTER TABLE harmony_sections ADD COLUMN headnote   TEXT;
CREATE INDEX idx_harmony_sections_harmony ON harmony_sections(harmony_id, sort_order);

CREATE TABLE harmony_section_notes (
  id           INTEGER PRIMARY KEY,
  section_id   INTEGER NOT NULL REFERENCES harmony_sections(id) ON DELETE CASCADE,
  sort_order   INTEGER NOT NULL,
  marker       TEXT NOT NULL,   -- the footnote letter as the harmony prints it
  text         TEXT NOT NULL,
  essay_number INTEGER          -- the essay it defers to, where it does
);
CREATE INDEX idx_harmony_section_notes_section ON harmony_section_notes(section_id, sort_order);

CREATE TABLE harmony_essays (
  id          INTEGER PRIMARY KEY,
  harmony_id  INTEGER NOT NULL REFERENCES harmonies(id) ON DELETE CASCADE,
  number      INTEGER NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,    -- paragraphs separated by a blank line
  UNIQUE(harmony_id, number)
);
"#;

// The shipped books left content.db for a file of their own.
//
// Their text and its search index were a third of this database -- 330 MB of
// the gigabyte -- and they are the one part of it a reader might reasonably
// not want. So they moved into `library.db`, which ships as a separate
// resource pack and is ATTACHed as `library` when one is installed (see
// `LIBRARY_MIGRATIONS` below and `crate::pack`).
//
// CONTENT_MIGRATION_0011 is left exactly as it was written rather than
// edited away: migrations are append-only here, and an existing content.db
// has to be walked forward through the version that created these tables to
// reach the version that drops them. A freshly built one runs both in turn
// and ends up in the same place, one table create and drop the poorer.
//
// Dropping `library_fts` takes its four shadow tables with it. The triggers
// have to go first -- they reference a table that is about to not exist.
pub const CONTENT_MIGRATION_0018: &str = r#"
DROP TRIGGER IF EXISTS library_ai;
DROP TRIGGER IF EXISTS library_au;
DROP TRIGGER IF EXISTS library_ad;
DROP TABLE IF EXISTS library_fts;
DROP TABLE IF EXISTS library_resources;
"#;

// What a translation is, beyond its name: the terms it ships under and the
// credit line those terms require, how much of the Bible it covers, and the
// script and direction it is written in.
//
// `license_status` stays the flag it always was ('licensed' marks a reader's
// own copyrighted import). `license` is the actual licence text shown in
// About -- "Public domain", "CC BY-SA 4.0", "CC0" -- and `credit` the line a
// CC BY work must carry wherever it is reproduced. Both are NULL for a
// translation imported without them (every Zefania file), which About reads
// as public domain because that is what every bundled Zefania file is.
//
// `script` ('latin', 'greek', 'hebrew') and `direction` ('ltr', 'rtl') are
// for the original-language editions: a Hebrew pane reads right to left, and
// the translation picker lists the Greek and Hebrew texts under their own
// heading. `scope` is a short human note ("New Testament and part of the
// Old") for a translation that does not cover all 66 books.
pub const CONTENT_MIGRATION_0019: &str = r#"
ALTER TABLE translations ADD COLUMN license TEXT;
ALTER TABLE translations ADD COLUMN credit TEXT;
ALTER TABLE translations ADD COLUMN scope TEXT;
ALTER TABLE translations ADD COLUMN script TEXT NOT NULL DEFAULT 'latin';
ALTER TABLE translations ADD COLUMN direction TEXT NOT NULL DEFAULT 'ltr';
"#;

// Two things search and the word study need that the index alone cannot give.
//
// `search_vocab` is every word the English translations use, with how often:
// the suggestions under the search box, and "did you mean" when a word
// matches nothing. FTS5 has its own vocabulary, but it holds stems
// ("belov"), which are no use to show a reader. Built at import from the
// verse text (see `import::vocab`).
//
// The indexes put a Strong's number, a lemma, or a parsing code one lookup
// away from every verse that has it: `G26` in the search box, the word study's
// occurrence list, and the morphology search all start there.
pub const CONTENT_MIGRATION_0020: &str = r#"
CREATE TABLE search_vocab (
  word   TEXT PRIMARY KEY,
  count  INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX idx_morphology_strongs ON morphology_words(strongs_id);
CREATE INDEX idx_morphology_lemma ON morphology_words(lemma);
CREATE INDEX idx_morphology_code ON morphology_words(morph_code);
CREATE INDEX idx_interlinear_strongs ON interlinear_words(strongs_id);
"#;

// The word study and the morphology search.
//
// `morph_codes` is every parsing code in `morphology_words`, read into plain
// fields by `crate::morph` at import -- "aorist", "imperative", "genitive" --
// so the search form can ask for fields and the word study can say what a
// form is without anyone reading a code letter. Keyed by the code as stored.
//
// `lemma_glosses` is how the KJV renders each Strong's number: the English
// the interlinear tags with that number, lower-cased, with how often. It is
// the "renderings" list of a word study, and the filter on its occurrences.
pub const CONTENT_MIGRATION_0021: &str = r#"
CREATE TABLE morph_codes (
  code            TEXT PRIMARY KEY,
  language        TEXT NOT NULL,
  part_of_speech  TEXT,
  tense           TEXT,
  voice           TEXT,
  mood            TEXT,
  person          TEXT,
  number          TEXT,
  gender          TEXT,
  gram_case       TEXT,
  state           TEXT,
  stem            TEXT,
  kind            TEXT,
  description     TEXT NOT NULL
) WITHOUT ROWID;
CREATE TABLE lemma_glosses (
  strongs_id  TEXT NOT NULL,
  gloss       TEXT NOT NULL,
  count       INTEGER NOT NULL,
  PRIMARY KEY (strongs_id, gloss)
) WITHOUT ROWID;
"#;

// The full lexicons beside Strong's: BDB, Abbott-Smith, LSJ, and the brief
// lexicons (see `import::reference::lexicons`). Strong's and Thayer's stay
// where they are, for the popup's short definition; these are the shelf
// behind them.
//
// An entry is keyed three ways: by `strongs_id` (how the popup and the word
// study reach it), by `headword_plain` (the headword's bare letters, how a
// Greek or Hebrew word typed without accents or points finds it), and by
// full text. A Strong's number can have several entries in one lexicon --
// BDB gives חֶסֶד "goodness" and חֶסֶד "shame" separate articles.
pub const CONTENT_MIGRATION_0022: &str = r#"
CREATE TABLE lexicon_sources (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  language    TEXT NOT NULL,
  license     TEXT NOT NULL,
  credit      TEXT NOT NULL,
  sort_order  INTEGER NOT NULL
);
CREATE TABLE lexicon_entries (
  id              INTEGER PRIMARY KEY,
  source_id       INTEGER NOT NULL REFERENCES lexicon_sources(id) ON DELETE CASCADE,
  headword        TEXT NOT NULL,
  headword_plain  TEXT NOT NULL,
  strongs_id      TEXT,
  html            TEXT NOT NULL,
  plain_text      TEXT NOT NULL
);
CREATE INDEX idx_lexicon_strongs ON lexicon_entries(strongs_id, source_id);
CREATE INDEX idx_lexicon_plain ON lexicon_entries(headword_plain);
CREATE VIRTUAL TABLE lexicon_fts USING fts5(
  headword, headword_plain, plain_text,
  content='lexicon_entries', content_rowid='id',
  tokenize='porter unicode61'
);
CREATE TRIGGER lexicon_ai AFTER INSERT ON lexicon_entries BEGIN
  INSERT INTO lexicon_fts(rowid, headword, headword_plain, plain_text)
  VALUES (new.id, new.headword, new.headword_plain, new.plain_text);
END;
CREATE TRIGGER lexicon_ad AFTER DELETE ON lexicon_entries BEGIN
  INSERT INTO lexicon_fts(lexicon_fts, rowid, headword, headword_plain, plain_text)
  VALUES ('delete', old.id, old.headword, old.headword_plain, old.plain_text);
END;
"#;

// A second index over the Greek and Hebrew texts, of their bare letters:
// accents, breathings, vowel points and cantillation removed (see
// `crate::plain`). A reader types בראשית, not בְּרֵאשִׁית; this is what
// matches it. Rowid is the verse's id. Rebuilt at every import, from every
// translation whose script is not Latin (see `import::plain_index`).
pub const CONTENT_MIGRATION_0023: &str = r#"
CREATE VIRTUAL TABLE verses_plain USING fts5(text, tokenize='unicode61');
"#;

// The Factbook: one entry per person, place and named thing, from STEPBible's
// TIPNR (see `import::reference::factbook`). `id` is TIPNR's unique name
// ("Zechariah@2Ch.24.20-Luk"), stable across its releases.
//
// `factbook_names` is every form of the name, with its Hebrew or Greek and
// Strong's number (`strongs_id` as TIPNR disambiguates it, "H2148w";
// `strongs_plain` as the rest of the app numbers it, "H2148").
// `factbook_verses` is every verse that names the entity, keyed for the
// passage lookup; `factbook_links` the encyclopedia articles, dictionary
// entries and atlas place it is linked to.
pub const CONTENT_MIGRATION_0024: &str = r#"
CREATE TABLE factbook_entities (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL CHECK(kind IN ('person','place','other')),
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  summary      TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  tribe        TEXT,
  region       TEXT,
  lat          REAL,
  lon          REAL,
  verse_count  INTEGER NOT NULL
);
CREATE INDEX idx_factbook_name ON factbook_entities(name COLLATE NOCASE);
CREATE TABLE factbook_names (
  id             INTEGER PRIMARY KEY,
  entity_id      TEXT NOT NULL REFERENCES factbook_entities(id),
  significance   TEXT NOT NULL,
  english        TEXT NOT NULL,
  original       TEXT,
  strongs_id     TEXT,
  strongs_plain  TEXT
);
CREATE INDEX idx_factbook_names_entity ON factbook_names(entity_id);
CREATE INDEX idx_factbook_names_english ON factbook_names(english COLLATE NOCASE);
CREATE INDEX idx_factbook_names_strongs ON factbook_names(strongs_plain);
CREATE TABLE factbook_relations (
  id         INTEGER PRIMARY KEY,
  from_id    TEXT NOT NULL REFERENCES factbook_entities(id),
  to_id      TEXT NOT NULL REFERENCES factbook_entities(id),
  kind       TEXT NOT NULL,
  qualifier  TEXT
);
CREATE INDEX idx_factbook_relations_from ON factbook_relations(from_id);
CREATE INDEX idx_factbook_relations_to ON factbook_relations(to_id);
CREATE TABLE factbook_verses (
  entity_id  TEXT NOT NULL REFERENCES factbook_entities(id),
  book_id    INTEGER NOT NULL,
  chapter    INTEGER NOT NULL,
  verse      INTEGER NOT NULL,
  PRIMARY KEY (entity_id, book_id, chapter, verse)
) WITHOUT ROWID;
CREATE INDEX idx_factbook_verses_passage ON factbook_verses(book_id, chapter, verse);
CREATE TABLE factbook_links (
  entity_id  TEXT NOT NULL REFERENCES factbook_entities(id),
  kind       TEXT NOT NULL CHECK(kind IN ('isbe','dictionary','atlas')),
  slug       TEXT NOT NULL,
  PRIMARY KEY (entity_id, kind, slug)
) WITHOUT ROWID;
"#;

// The timeline (0.3 step 6): Theographic's events and eras, resolved to the
// Factbook's people and places. Years are astronomical and fractional (1 BC
// is 0; 588 BC is -587), which is what the view lays out on.
pub const CONTENT_MIGRATION_0025: &str = r#"
CREATE TABLE timeline_eras (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  start_year  REAL NOT NULL,
  end_year    REAL NOT NULL,
  journey_era TEXT,
  sort_order  INTEGER NOT NULL
) WITHOUT ROWID;
CREATE TABLE timeline_events (
  id          INTEGER PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  start_year  REAL NOT NULL,
  end_year    REAL NOT NULL,
  precision   TEXT NOT NULL CHECK(precision IN ('year','month','day')),
  parent_key  TEXT,
  lane        TEXT CHECK(lane IN ('judah','israel')),
  note        TEXT,
  source      TEXT NOT NULL CHECK(source IN ('theographic','added')),
  book_id     INTEGER,
  chapter     INTEGER,
  verse       INTEGER
);
CREATE INDEX idx_timeline_events_start ON timeline_events(start_year);
CREATE TABLE timeline_event_verses (
  event_id INTEGER NOT NULL REFERENCES timeline_events(id),
  book_id  INTEGER NOT NULL,
  chapter  INTEGER NOT NULL,
  verse    INTEGER NOT NULL,
  PRIMARY KEY (event_id, book_id, chapter, verse)
) WITHOUT ROWID;
CREATE INDEX idx_timeline_event_verses_passage ON timeline_event_verses(book_id, chapter);
CREATE TABLE timeline_event_entities (
  event_id  INTEGER NOT NULL REFERENCES timeline_events(id),
  entity_id TEXT NOT NULL REFERENCES factbook_entities(id),
  role      TEXT NOT NULL CHECK(role IN ('person','place')),
  PRIMARY KEY (event_id, entity_id)
) WITHOUT ROWID;
CREATE INDEX idx_timeline_event_entities_entity ON timeline_event_entities(entity_id);
CREATE TABLE timeline_chapter_years (
  book_id    INTEGER NOT NULL,
  chapter    INTEGER NOT NULL,
  start_year REAL NOT NULL,
  end_year   REAL NOT NULL,
  PRIMARY KEY (book_id, chapter)
) WITHOUT ROWID;
"#;

// What each shipped book is, for grouping in Resources: its shelf and its
// subject, from the committed shelf lists (library/manifest.json and
// library/shelves/*.json). Here rather than in the packs so that it reaches a
// reader whatever pack version they installed, and can be improved in any app
// update without rebuilding a pack.
pub const CONTENT_MIGRATION_0026: &str = r#"
CREATE TABLE library_catalog (
  file_name   TEXT PRIMARY KEY,
  shelf_id    TEXT NOT NULL,
  shelf_name  TEXT NOT NULL,
  shelf_order INTEGER NOT NULL,
  subject     TEXT
) WITHOUT ROWID;
"#;

pub const CONTENT_MIGRATIONS: &[&str] = &[
    CONTENT_MIGRATION_0001,
    CONTENT_MIGRATION_0002,
    CONTENT_MIGRATION_0003,
    CONTENT_MIGRATION_0004,
    CONTENT_MIGRATION_0005,
    CONTENT_MIGRATION_0006,
    CONTENT_MIGRATION_0007,
    CONTENT_MIGRATION_0008,
    CONTENT_MIGRATION_0009,
    CONTENT_MIGRATION_0010,
    CONTENT_MIGRATION_0011,
    CONTENT_MIGRATION_0012,
    CONTENT_MIGRATION_0013,
    CONTENT_MIGRATION_0014,
    CONTENT_MIGRATION_0015,
    CONTENT_MIGRATION_0016,
    CONTENT_MIGRATION_0017,
    CONTENT_MIGRATION_0018,
    CONTENT_MIGRATION_0019,
    CONTENT_MIGRATION_0020,
    CONTENT_MIGRATION_0021,
    CONTENT_MIGRATION_0022,
    CONTENT_MIGRATION_0023,
    CONTENT_MIGRATION_0024,
    CONTENT_MIGRATION_0025,
    CONTENT_MIGRATION_0026,
];

// library.db: the books that ship with the app, in a file of their own.
//
// This is the whole schema of the resource pack -- the same two tables and
// three triggers that CONTENT_MIGRATION_0011 once created inside content.db,
// moved here verbatim so a pack built by `build_library_pack` and a pack read
// by the running app agree down to the trigger bodies.
//
// `library_fts` is an external-content table over `library_resources`
// (`content='library_resources'`), which is why the pair could only ever move
// together: FTS5 reads the base table's rows by rowid out of the same
// database file, and there is no syntax for reaching across an ATTACH.
pub const LIBRARY_MIGRATION_0001: &str = r#"
CREATE TABLE library_resources (
  id              INTEGER PRIMARY KEY,
  file_name       TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL,
  title           TEXT NOT NULL,
  author          TEXT,
  extracted_text  TEXT
);
CREATE VIRTUAL TABLE library_fts USING fts5(
  title, author, extracted_text, content='library_resources', content_rowid='id'
);
CREATE TRIGGER library_ai AFTER INSERT ON library_resources BEGIN
  INSERT INTO library_fts(rowid, title, author, extracted_text)
  VALUES (new.id, new.title, new.author, new.extracted_text);
END;
CREATE TRIGGER library_au AFTER UPDATE ON library_resources BEGIN
  INSERT INTO library_fts(library_fts, rowid, title, author, extracted_text)
  VALUES('delete', old.id, old.title, old.author, old.extracted_text);
  INSERT INTO library_fts(rowid, title, author, extracted_text)
  VALUES (new.id, new.title, new.author, new.extracted_text);
END;
CREATE TRIGGER library_ad AFTER DELETE ON library_resources BEGIN
  INSERT INTO library_fts(library_fts, rowid, title, author, extracted_text)
  VALUES('delete', old.id, old.title, old.author, old.extracted_text);
END;
"#;

// Every Scripture reference in every book, found at pack build (see
// `crate::citations`): the passage it cites, where it stands, a stretch of
// the sentence around it, and the reference as printed with which occurrence
// of that printing it is, so the reader can open the book at that spot. What
// "cited in your library" reads beside a verse.
pub const LIBRARY_MIGRATION_0002: &str = r#"
CREATE TABLE library_citations (
  id           INTEGER PRIMARY KEY,
  resource_id  INTEGER NOT NULL REFERENCES library_resources(id) ON DELETE CASCADE,
  char_offset  INTEGER NOT NULL,
  label        TEXT NOT NULL,
  occurrence   INTEGER NOT NULL,
  context      TEXT NOT NULL,
  book_id      INTEGER NOT NULL,
  chapter      INTEGER NOT NULL,
  verse_start  INTEGER NOT NULL,
  verse_end    INTEGER NOT NULL
);
CREATE INDEX idx_library_citations_passage ON library_citations(book_id, chapter, verse_start);
CREATE INDEX idx_library_citations_resource ON library_citations(resource_id);
"#;

pub const LIBRARY_MIGRATIONS: &[&str] = &[LIBRARY_MIGRATION_0001, LIBRARY_MIGRATION_0002];

pub const USER_MIGRATION_0001: &str = r#"
CREATE TABLE highlights (
  id             INTEGER PRIMARY KEY,
  book_id        INTEGER NOT NULL,
  chapter        INTEGER NOT NULL,
  verse_start    INTEGER NOT NULL,
  verse_end      INTEGER NOT NULL,
  char_start     INTEGER,
  char_end       INTEGER,
  color          TEXT NOT NULL,
  style          TEXT NOT NULL DEFAULT 'highlight',
  translation_id INTEGER,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_highlights_lookup ON highlights(book_id, chapter);

CREATE TABLE notes (
  id             INTEGER PRIMARY KEY,
  book_id        INTEGER NOT NULL,
  chapter        INTEGER NOT NULL,
  verse_start    INTEGER NOT NULL,
  verse_end      INTEGER NOT NULL,
  body           TEXT NOT NULL,
  highlight_id   INTEGER REFERENCES highlights(id),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_notes_lookup ON notes(book_id, chapter);

CREATE TABLE bookmarks (
  id          INTEGER PRIMARY KEY,
  book_id     INTEGER NOT NULL,
  chapter     INTEGER NOT NULL,
  verse       INTEGER,
  label       TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE passage_links (
  id                     INTEGER PRIMARY KEY,
  from_book_id           INTEGER NOT NULL,
  from_chapter           INTEGER NOT NULL,
  from_verse_start       INTEGER NOT NULL,
  from_verse_end         INTEGER NOT NULL,
  to_book_id             INTEGER,
  to_chapter             INTEGER,
  to_verse_start         INTEGER,
  to_verse_end           INTEGER,
  to_commentary_entry_id INTEGER,
  note                   TEXT,
  created_at             TEXT NOT NULL
);

CREATE TABLE reading_position (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  translation_id INTEGER,
  book_id        INTEGER,
  chapter        INTEGER,
  verse          INTEGER,
  updated_at     TEXT NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE resources (
  id              INTEGER PRIMARY KEY,
  kind            TEXT NOT NULL CHECK(kind IN ('epub','pdf','mobi','video','audio')),
  title           TEXT NOT NULL,
  author          TEXT,
  file_path       TEXT NOT NULL,
  extracted_text  TEXT,
  added_at        TEXT NOT NULL
);
CREATE VIRTUAL TABLE resources_fts USING fts5(
  title, author, extracted_text, content='resources', content_rowid='id'
);
CREATE TRIGGER resources_ai AFTER INSERT ON resources BEGIN
  INSERT INTO resources_fts(rowid, title, author, extracted_text) VALUES (new.id, new.title, new.author, new.extracted_text);
END;
CREATE TRIGGER resources_au AFTER UPDATE ON resources BEGIN
  INSERT INTO resources_fts(resources_fts, rowid, title, author, extracted_text) VALUES('delete', old.id, old.title, old.author, old.extracted_text);
  INSERT INTO resources_fts(rowid, title, author, extracted_text) VALUES (new.id, new.title, new.author, new.extracted_text);
END;
CREATE TRIGGER resources_ad AFTER DELETE ON resources BEGIN
  INSERT INTO resources_fts(resources_fts, rowid, title, author, extracted_text) VALUES('delete', old.id, old.title, old.author, old.extracted_text);
END;

CREATE TABLE resource_passage_links (
  id           INTEGER PRIMARY KEY,
  resource_id  INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  book_id      INTEGER NOT NULL,
  chapter      INTEGER NOT NULL,
  verse_start  INTEGER,
  verse_end    INTEGER,
  location     TEXT,
  label        TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_resource_passage_links_passage ON resource_passage_links(book_id, chapter);
CREATE INDEX idx_resource_passage_links_resource ON resource_passage_links(resource_id);

CREATE TABLE resource_links (
  id                INTEGER PRIMARY KEY,
  from_resource_id  INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  to_resource_id    INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  from_location     TEXT,
  label             TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_resource_links_from ON resource_links(from_resource_id);

CREATE TABLE chapter_notes (
  id         INTEGER PRIMARY KEY,
  book_id    INTEGER NOT NULL,
  chapter    INTEGER NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_chapter_notes_passage ON chapter_notes(book_id, chapter);
"#;

pub const USER_MIGRATION_0002: &str = r#"
-- A sermon note is distinct from a passage/chapter note: it records a
-- sermon heard (or preached), not a study observation on the text itself.
-- Linked to the passage(s) preached the same way resources link to
-- passages (a separate many-to-many table), since a topical sermon can
-- range across more than one text.
CREATE TABLE sermon_notes (
  id           INTEGER PRIMARY KEY,
  date         TEXT NOT NULL,
  preacher     TEXT,
  title        TEXT,
  passage_text TEXT,
  outline      TEXT,
  application  TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE VIRTUAL TABLE sermon_notes_fts USING fts5(
  preacher, title, passage_text, outline, application,
  content='sermon_notes', content_rowid='id'
);
CREATE TRIGGER sermon_notes_ai AFTER INSERT ON sermon_notes BEGIN
  INSERT INTO sermon_notes_fts(rowid, preacher, title, passage_text, outline, application)
  VALUES (new.id, new.preacher, new.title, new.passage_text, new.outline, new.application);
END;
CREATE TRIGGER sermon_notes_au AFTER UPDATE ON sermon_notes BEGIN
  INSERT INTO sermon_notes_fts(sermon_notes_fts, rowid, preacher, title, passage_text, outline, application)
  VALUES('delete', old.id, old.preacher, old.title, old.passage_text, old.outline, old.application);
  INSERT INTO sermon_notes_fts(rowid, preacher, title, passage_text, outline, application)
  VALUES (new.id, new.preacher, new.title, new.passage_text, new.outline, new.application);
END;
CREATE TRIGGER sermon_notes_ad AFTER DELETE ON sermon_notes BEGIN
  INSERT INTO sermon_notes_fts(sermon_notes_fts, rowid, preacher, title, passage_text, outline, application)
  VALUES('delete', old.id, old.preacher, old.title, old.passage_text, old.outline, old.application);
END;

CREATE TABLE sermon_note_passage_links (
  id              INTEGER PRIMARY KEY,
  sermon_note_id  INTEGER NOT NULL REFERENCES sermon_notes(id) ON DELETE CASCADE,
  book_id         INTEGER NOT NULL,
  chapter         INTEGER NOT NULL,
  verse_start     INTEGER,
  verse_end       INTEGER,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_sermon_note_passage_links_passage ON sermon_note_passage_links(book_id, chapter);
CREATE INDEX idx_sermon_note_passage_links_note ON sermon_note_passage_links(sermon_note_id);

-- ACTS-structured (Adoration, Confession, Thanksgiving, Supplication) prayer
-- journal. Each field is optional since not every entry uses all four.
-- Optionally tied to a passage (a single one -- unlike sermons, a prayer
-- entry isn't naturally multi-passage, so a direct column is simpler than a
-- link table here).
CREATE TABLE prayer_entries (
  id            INTEGER PRIMARY KEY,
  entry_date    TEXT NOT NULL,
  adoration     TEXT,
  confession    TEXT,
  thanksgiving  TEXT,
  supplication  TEXT,
  book_id       INTEGER,
  chapter       INTEGER,
  verse_start   INTEGER,
  verse_end     INTEGER,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX idx_prayer_entries_date ON prayer_entries(entry_date);
CREATE VIRTUAL TABLE prayer_entries_fts USING fts5(
  adoration, confession, thanksgiving, supplication,
  content='prayer_entries', content_rowid='id'
);
CREATE TRIGGER prayer_entries_ai AFTER INSERT ON prayer_entries BEGIN
  INSERT INTO prayer_entries_fts(rowid, adoration, confession, thanksgiving, supplication)
  VALUES (new.id, new.adoration, new.confession, new.thanksgiving, new.supplication);
END;
CREATE TRIGGER prayer_entries_au AFTER UPDATE ON prayer_entries BEGIN
  INSERT INTO prayer_entries_fts(prayer_entries_fts, rowid, adoration, confession, thanksgiving, supplication)
  VALUES('delete', old.id, old.adoration, old.confession, old.thanksgiving, old.supplication);
  INSERT INTO prayer_entries_fts(rowid, adoration, confession, thanksgiving, supplication)
  VALUES (new.id, new.adoration, new.confession, new.thanksgiving, new.supplication);
END;
CREATE TRIGGER prayer_entries_ad AFTER DELETE ON prayer_entries BEGIN
  INSERT INTO prayer_entries_fts(prayer_entries_fts, rowid, adoration, confession, thanksgiving, supplication)
  VALUES('delete', old.id, old.adoration, old.confession, old.thanksgiving, old.supplication);
END;

-- Scripture memory: a verse card (one per memorized passage) plus its own
-- spaced-repetition schedule state, and per-passage user preference for
-- which practice mode(s) to use (first-letter / blank-the-word).
CREATE TABLE memory_verses (
  id            INTEGER PRIMARY KEY,
  book_id       INTEGER NOT NULL,
  chapter       INTEGER NOT NULL,
  verse_start   INTEGER NOT NULL,
  verse_end     INTEGER NOT NULL,
  translation_id INTEGER,
  mode          TEXT NOT NULL DEFAULT 'first-letter' CHECK(mode IN ('first-letter','blank-word')),
  -- SM-2-style spaced repetition state.
  ease_factor   REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  repetitions   INTEGER NOT NULL DEFAULT 0,
  due_at        TEXT NOT NULL,
  last_reviewed_at TEXT,
  created_at    TEXT NOT NULL,
  UNIQUE(book_id, chapter, verse_start, verse_end, translation_id)
);
CREATE INDEX idx_memory_verses_due ON memory_verses(due_at);
"#;

pub const USER_MIGRATION_0003: &str = r#"
-- A user's progress through a reading_plans row in content.db, addressed by
-- the plan's `code` rather than its content-db integer id -- the two files
-- can't share a FOREIGN KEY, and the code is stable across a content.db
-- rebuild while an autoincrement id isn't guaranteed to be.
CREATE TABLE reading_plan_progress (
  plan_code   TEXT PRIMARY KEY,
  start_date  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE reading_plan_completions (
  id            INTEGER PRIMARY KEY,
  plan_code     TEXT NOT NULL,
  day_number    INTEGER NOT NULL,
  completed_at  TEXT NOT NULL,
  UNIQUE(plan_code, day_number)
);
CREATE INDEX idx_reading_plan_completions_plan ON reading_plan_completions(plan_code);
"#;

pub const USER_MIGRATION_0004: &str = r#"
-- Full-text search over the user's own study notes (chapter notes and
-- passage notes share the `notes`/`chapter_notes` split already used
-- elsewhere; both get indexed here so "search" can surface a study
-- observation the same way it surfaces a verse or commentary entry).
CREATE VIRTUAL TABLE notes_fts USING fts5(
  body, content='notes', content_rowid='id'
);
CREATE TRIGGER notes_search_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, body) VALUES (new.id, new.body);
END;
CREATE TRIGGER notes_search_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, body) VALUES('delete', old.id, old.body);
  INSERT INTO notes_fts(rowid, body) VALUES (new.id, new.body);
END;
CREATE TRIGGER notes_search_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, body) VALUES('delete', old.id, old.body);
END;

CREATE VIRTUAL TABLE chapter_notes_fts USING fts5(
  body, content='chapter_notes', content_rowid='id'
);
CREATE TRIGGER chapter_notes_search_ai AFTER INSERT ON chapter_notes BEGIN
  INSERT INTO chapter_notes_fts(rowid, body) VALUES (new.id, new.body);
END;
CREATE TRIGGER chapter_notes_search_au AFTER UPDATE ON chapter_notes BEGIN
  INSERT INTO chapter_notes_fts(chapter_notes_fts, rowid, body) VALUES('delete', old.id, old.body);
  INSERT INTO chapter_notes_fts(rowid, body) VALUES (new.id, new.body);
END;
CREATE TRIGGER chapter_notes_search_ad AFTER DELETE ON chapter_notes BEGIN
  INSERT INTO chapter_notes_fts(chapter_notes_fts, rowid, body) VALUES('delete', old.id, old.body);
END;

-- Search history: every executed query is upserted here (bumping
-- created_at on a repeat rather than duplicating), pruned to the most
-- recent 20 *unsaved* entries after each insert. A user can pin one via
-- `saved = 1`, which exempts it from that pruning -- saved searches are
-- kept indefinitely until explicitly deleted.
CREATE TABLE search_history (
  id          INTEGER PRIMARY KEY,
  query       TEXT NOT NULL UNIQUE,
  saved       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_search_history_recent ON search_history(saved, created_at);
"#;

pub const USER_MIGRATION_0005: &str = r#"
-- Prayer journal gets a second entry style: free-form writing alongside the
-- original four-part ACTS structure. `mode` records which the entry was
-- written as (so the editor knows which fields to show); `free_text` holds
-- the free-write body. The FTS5 table is external-content over the same
-- row, so adding a column to what it indexes means recreating the virtual
-- table (fts5 columns are fixed at creation) and rebuilding its index from
-- the now-five source columns, then reinstalling the sync triggers.
ALTER TABLE prayer_entries ADD COLUMN mode TEXT NOT NULL DEFAULT 'acts';
ALTER TABLE prayer_entries ADD COLUMN free_text TEXT;

DROP TRIGGER prayer_entries_ai;
DROP TRIGGER prayer_entries_au;
DROP TRIGGER prayer_entries_ad;
DROP TABLE prayer_entries_fts;

CREATE VIRTUAL TABLE prayer_entries_fts USING fts5(
  adoration, confession, thanksgiving, supplication, free_text,
  content='prayer_entries', content_rowid='id'
);
INSERT INTO prayer_entries_fts(rowid, adoration, confession, thanksgiving, supplication, free_text)
  SELECT id, adoration, confession, thanksgiving, supplication, free_text FROM prayer_entries;

CREATE TRIGGER prayer_entries_ai AFTER INSERT ON prayer_entries BEGIN
  INSERT INTO prayer_entries_fts(rowid, adoration, confession, thanksgiving, supplication, free_text)
  VALUES (new.id, new.adoration, new.confession, new.thanksgiving, new.supplication, new.free_text);
END;
CREATE TRIGGER prayer_entries_au AFTER UPDATE ON prayer_entries BEGIN
  INSERT INTO prayer_entries_fts(prayer_entries_fts, rowid, adoration, confession, thanksgiving, supplication, free_text)
  VALUES('delete', old.id, old.adoration, old.confession, old.thanksgiving, old.supplication, old.free_text);
  INSERT INTO prayer_entries_fts(rowid, adoration, confession, thanksgiving, supplication, free_text)
  VALUES (new.id, new.adoration, new.confession, new.thanksgiving, new.supplication, new.free_text);
END;
CREATE TRIGGER prayer_entries_ad AFTER DELETE ON prayer_entries BEGIN
  INSERT INTO prayer_entries_fts(prayer_entries_fts, rowid, adoration, confession, thanksgiving, supplication, free_text)
  VALUES('delete', old.id, old.adoration, old.confession, old.thanksgiving, old.supplication, old.free_text);
END;

-- Prayer list: ongoing people/requests to pray for, separate from the dated
-- journal entries above. `active = 0` marks a request archived (e.g. an
-- answered prayer) without deleting its history; `last_prayed_at` lets the
-- list be sorted by what hasn't been prayed for in a while.
CREATE TABLE prayer_list_people (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  category        TEXT,
  notes           TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  last_prayed_at  TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX idx_prayer_list_people_active ON prayer_list_people(active);
"#;

pub const USER_MIGRATION_0006: &str = r#"
-- Scripture Memory gets a third practice mode: typing the verse from memory
-- rather than only being shown a masked version of it. SQLite can't widen a
-- CHECK constraint in place, so the table is rebuilt with the extended list;
-- `PRAGMA foreign_keys=OFF` isn't needed here (no FK on this table) but the
-- rebuild-copy-drop-rename sequence is the standard way to change a CHECK.
CREATE TABLE memory_verses_new (
  id            INTEGER PRIMARY KEY,
  book_id       INTEGER NOT NULL,
  chapter       INTEGER NOT NULL,
  verse_start   INTEGER NOT NULL,
  verse_end     INTEGER NOT NULL,
  translation_id INTEGER,
  mode          TEXT NOT NULL DEFAULT 'first-letter' CHECK(mode IN ('first-letter','blank-word','type-it')),
  ease_factor   REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  repetitions   INTEGER NOT NULL DEFAULT 0,
  due_at        TEXT NOT NULL,
  last_reviewed_at TEXT,
  created_at    TEXT NOT NULL,
  UNIQUE(book_id, chapter, verse_start, verse_end, translation_id)
);
INSERT INTO memory_verses_new SELECT * FROM memory_verses;
DROP TABLE memory_verses;
ALTER TABLE memory_verses_new RENAME TO memory_verses;
CREATE INDEX idx_memory_verses_due ON memory_verses(due_at);
"#;

pub const USER_MIGRATION_0007: &str = r#"
-- Sermon notes revamp: a series to group a multi-week sermon set (grouping
-- by book is already free -- it comes from each note's passage links), a
-- free-tag system for doctrine/topic search, and two more link kinds
-- alongside the existing passage links: to a Westminster confession
-- section, and to a Strong's-tagged word study (an observation on a
-- specific original-language word, pointing back into the interlinear).
-- The confession/word-study link tables reference content.db rows
-- (westminster_sections, strongs_entries) with plain integer/text columns
-- and no FOREIGN KEY, same reasoning as every other content.db reference
-- from user.db elsewhere in this schema (see the file-level comment above).
ALTER TABLE sermon_notes ADD COLUMN series TEXT;
CREATE INDEX idx_sermon_notes_series ON sermon_notes(series);

CREATE TABLE sermon_note_tags (
  id              INTEGER PRIMARY KEY,
  sermon_note_id  INTEGER NOT NULL REFERENCES sermon_notes(id) ON DELETE CASCADE,
  tag             TEXT NOT NULL,
  UNIQUE(sermon_note_id, tag)
);
CREATE INDEX idx_sermon_note_tags_tag ON sermon_note_tags(tag);
CREATE INDEX idx_sermon_note_tags_note ON sermon_note_tags(sermon_note_id);

CREATE TABLE sermon_note_confession_links (
  id                     INTEGER PRIMARY KEY,
  sermon_note_id         INTEGER NOT NULL REFERENCES sermon_notes(id) ON DELETE CASCADE,
  westminster_section_id INTEGER NOT NULL,
  created_at             TEXT NOT NULL
);
CREATE INDEX idx_sermon_note_confession_links_note ON sermon_note_confession_links(sermon_note_id);

CREATE TABLE sermon_note_word_studies (
  id              INTEGER PRIMARY KEY,
  sermon_note_id  INTEGER NOT NULL REFERENCES sermon_notes(id) ON DELETE CASCADE,
  strongs_id      TEXT NOT NULL,
  note            TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_sermon_note_word_studies_note ON sermon_note_word_studies(sermon_note_id);
"#;

pub const USER_MIGRATION_0008: &str = r#"
-- A memorized verse can optionally be tied to the catechism question or
-- confession paragraph it illustrates (Larger Catechism Q.157's "meditate
-- upon the sense" of a memorized text applies as much to Scripture memory
-- as to preaching), plus a short personal note on its doctrinal import --
-- turning rote recall into meditation rather than mere repetition. Both
-- nullable: most verses will carry neither.
ALTER TABLE memory_verses ADD COLUMN westminster_section_id INTEGER;
ALTER TABLE memory_verses ADD COLUMN doctrinal_note TEXT;

-- Catechism Study mode: the same SM-2 spaced-repetition machinery as
-- memory_verses, but keyed to a Westminster question/paragraph instead of a
-- Bible passage. Kept as its own table (matching this schema's existing
-- per-domain-table convention, e.g. sermon_notes vs. notes) rather than
-- folding into memory_verses, since the two have almost no columns in
-- common (no book/chapter/verse/translation here) and a shared "memory
-- item" abstraction would force every verse-only query to filter a type
-- discriminator for no benefit.
CREATE TABLE catechism_memory (
  id                      INTEGER PRIMARY KEY,
  westminster_section_id  INTEGER NOT NULL,
  mode                    TEXT NOT NULL DEFAULT 'type-it' CHECK(mode IN ('first-letter','blank-word','type-it')),
  ease_factor             REAL NOT NULL DEFAULT 2.5,
  interval_days           INTEGER NOT NULL DEFAULT 0,
  repetitions             INTEGER NOT NULL DEFAULT 0,
  due_at                  TEXT NOT NULL,
  last_reviewed_at        TEXT,
  created_at              TEXT NOT NULL,
  UNIQUE(westminster_section_id, mode)
);
CREATE INDEX idx_catechism_memory_due ON catechism_memory(due_at);
"#;

// Structured sermon outlines: a sermon note can hold more than one draft
// outline (a pastor revising a sermon across the week), each a tree of
// points/sub-points (self-referencing parent_id; NULL = a main point) plus a
// "use"/application under any point in the Puritan pattern (kind
// distinguishes the two so a UI can render them differently without a
// separate table). sort_order is scoped to siblings (same outline_id +
// parent_id), not global, so reordering one branch never touches another's
// numbering. sermon_notes.outline (the old plain-text field) is untouched --
// existing sermon notes keep rendering exactly as before; this is an
// additive, opt-in structure for new/revised outlines.
pub const USER_MIGRATION_0009: &str = r#"
CREATE TABLE sermon_outlines (
  id              INTEGER PRIMARY KEY,
  sermon_note_id  INTEGER NOT NULL REFERENCES sermon_notes(id) ON DELETE CASCADE,
  title           TEXT,
  proposition     TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX idx_sermon_outlines_note ON sermon_outlines(sermon_note_id);

CREATE TABLE sermon_outline_points (
  id            INTEGER PRIMARY KEY,
  outline_id    INTEGER NOT NULL REFERENCES sermon_outlines(id) ON DELETE CASCADE,
  parent_id     INTEGER REFERENCES sermon_outline_points(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'point' CHECK(kind IN ('point','use')),
  body          TEXT NOT NULL,
  doctrine_tag  TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_sermon_outline_points_outline ON sermon_outline_points(outline_id, parent_id, sort_order);

-- A point can cite a verse, a Strong's word study, or a Westminster
-- Confession/Catechism paragraph -- the three exegetical/confessional helps
-- named in the sermon-workspace request. Like sermon_note_confession_links
-- and sermon_note_word_studies, these reference content.db rows by plain
-- integer/text id with no FOREIGN KEY (files can't share one); only the
-- verse columns are meaningful for link_type='verse', etc.
CREATE TABLE sermon_outline_point_links (
  id                      INTEGER PRIMARY KEY,
  point_id                INTEGER NOT NULL REFERENCES sermon_outline_points(id) ON DELETE CASCADE,
  link_type               TEXT NOT NULL CHECK(link_type IN ('verse','strongs','confession')),
  book_id                 INTEGER,
  chapter                 INTEGER,
  verse_start             INTEGER,
  verse_end               INTEGER,
  strongs_id              TEXT,
  westminster_section_id  INTEGER,
  created_at              TEXT NOT NULL
);
CREATE INDEX idx_sermon_outline_point_links_point ON sermon_outline_point_links(point_id);

-- Free-tag/doctrine-use tagging for the personal-note and prayer features,
-- mirroring sermon_note_tags exactly (same UNIQUE-per-parent shape) so
-- notes/chapter notes/prayer entries can be searched and filtered by
-- doctrine or use (conviction/comfort/duty) the same way sermon notes
-- already are.
CREATE TABLE note_tags (
  id       INTEGER PRIMARY KEY,
  note_id  INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag      TEXT NOT NULL,
  UNIQUE(note_id, tag)
);
CREATE INDEX idx_note_tags_tag ON note_tags(tag);
CREATE INDEX idx_note_tags_note ON note_tags(note_id);

CREATE TABLE chapter_note_tags (
  id               INTEGER PRIMARY KEY,
  chapter_note_id  INTEGER NOT NULL REFERENCES chapter_notes(id) ON DELETE CASCADE,
  tag              TEXT NOT NULL,
  UNIQUE(chapter_note_id, tag)
);
CREATE INDEX idx_chapter_note_tags_tag ON chapter_note_tags(tag);
CREATE INDEX idx_chapter_note_tags_note ON chapter_note_tags(chapter_note_id);

CREATE TABLE prayer_entry_tags (
  id                INTEGER PRIMARY KEY,
  prayer_entry_id   INTEGER NOT NULL REFERENCES prayer_entries(id) ON DELETE CASCADE,
  tag               TEXT NOT NULL,
  UNIQUE(prayer_entry_id, tag)
);
CREATE INDEX idx_prayer_entry_tags_tag ON prayer_entry_tags(tag);
CREATE INDEX idx_prayer_entry_tags_entry ON prayer_entry_tags(prayer_entry_id);

CREATE TABLE resource_tags (
  id           INTEGER PRIMARY KEY,
  resource_id  INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  tag          TEXT NOT NULL,
  UNIQUE(resource_id, tag)
);
CREATE INDEX idx_resource_tags_tag ON resource_tags(tag);
CREATE INDEX idx_resource_tags_resource ON resource_tags(resource_id);

-- Answered-prayer detail: active=0 already marks a request archived (see
-- USER_MIGRATION_0005), but that alone can't distinguish "God answered
-- this" from any other reason a request left the active list. answered_at
-- being non-null is that distinction; answer_note records how, for the
-- encouragement-to-faith use the prayer journal feature is meant to serve.
ALTER TABLE prayer_list_people ADD COLUMN answered_at TEXT;
ALTER TABLE prayer_list_people ADD COLUMN answer_note TEXT;
"#;

// Sermon Notes and the Sermon Workspace's outline builder were removed --
// too complicated a tool for what this app is for. This drops every table
// the feature ever created (sermon_notes from USER_MIGRATION_0002,
// sermon_note_tags/confession_links/word_studies from USER_MIGRATION_0007,
// sermon_outlines/points/point_links from USER_MIGRATION_0009), children
// before parents so FOREIGN KEY constraints (enforced on this connection,
// see db/mod.rs's `PRAGMA foreign_keys = ON`) don't reject the drop order.
// DROP TABLE also removes any triggers defined on that table automatically
// (sermon_notes_ai/au/ad among them), so those don't need a separate
// DROP TRIGGER; the sermon_notes_fts virtual table is a distinct object
// and does need its own explicit drop.
pub const USER_MIGRATION_0010: &str = r#"
DROP TABLE sermon_note_word_studies;
DROP TABLE sermon_note_confession_links;
DROP TABLE sermon_note_tags;
DROP TABLE sermon_note_passage_links;
DROP TABLE sermon_outline_point_links;
DROP TABLE sermon_outline_points;
DROP TABLE sermon_outlines;
DROP TABLE sermon_notes_fts;
DROP TABLE sermon_notes;
"#;

// Soft delete for the three kinds of writing a user would most regret
// losing to a slip: passage notes, chapter notes, and prayer journal
// entries. Deleting sets `deleted_at` instead of removing the row; a Trash
// page can restore it, and a startup sweep hard-deletes anything older than
// thirty days (see db::queries::trash). Every list/search query filters on
// `deleted_at IS NULL` via the shared NOT_DELETED constant. The partial
// indexes only cover the (few) deleted rows, so the sweep and the Trash
// listing never scan live notes. The FTS5 tables are external-content over
// these rows, so deleted rows stay indexed; search joins the base table and
// filters there rather than rewriting the triggers.
pub const USER_MIGRATION_0011: &str = r#"
ALTER TABLE notes ADD COLUMN deleted_at TEXT;
ALTER TABLE chapter_notes ADD COLUMN deleted_at TEXT;
ALTER TABLE prayer_entries ADD COLUMN deleted_at TEXT;
CREATE INDEX idx_notes_deleted ON notes(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_chapter_notes_deleted ON chapter_notes(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_prayer_entries_deleted ON prayer_entries(deleted_at) WHERE deleted_at IS NOT NULL;
"#;

// Backlinks (F2.2): every Scripture reference a note mentions in its body,
// so a verse can list the notes elsewhere that talk about it. Exactly one
// of note_id / chapter_note_id is set. The references are extracted by the
// note editor (the same scanner that auto-links them for display) and sent
// with each save; a one-time frontend backfill fills the table for notes
// that predate this. A chapter-only mention ("Genesis 3") has null verses.
// Cascades keep the table in step with hard deletes and Trash purges;
// soft-deleted notes are filtered at query time like everything else.
pub const USER_MIGRATION_0012: &str = r#"
CREATE TABLE note_refs (
  id               INTEGER PRIMARY KEY,
  note_id          INTEGER REFERENCES notes(id) ON DELETE CASCADE,
  chapter_note_id  INTEGER REFERENCES chapter_notes(id) ON DELETE CASCADE,
  book_id          INTEGER NOT NULL,
  chapter          INTEGER NOT NULL,
  verse_start      INTEGER,
  verse_end        INTEGER,
  CHECK ((note_id IS NULL) <> (chapter_note_id IS NULL))
);
CREATE INDEX idx_note_refs_passage ON note_refs(book_id, chapter);
CREATE INDEX idx_note_refs_note ON note_refs(note_id);
CREATE INDEX idx_note_refs_chapter_note ON note_refs(chapter_note_id);
"#;

// Reading log (F3.1): one row per chapter opened per local calendar day,
// written alongside the reading position (see reading_position::set). It
// gives the Today page a durable "Recent chapters" list -- a pane's history
// lives only in local storage -- and feeds the reading-day heatmap in
// F3.5. `date` is the local day as YYYY-MM-DD; `translation_id` is the
// translation that was open, updated in place when the same chapter is
// reopened in another one. Scrolling through a chapter re-saves the
// position many times, hence the unique key rather than a plain log.
pub const USER_MIGRATION_0013: &str = r#"
CREATE TABLE reading_log (
  id              INTEGER PRIMARY KEY,
  date            TEXT NOT NULL,
  book_id         INTEGER NOT NULL,
  chapter         INTEGER NOT NULL,
  translation_id  INTEGER,
  UNIQUE(date, book_id, chapter)
);
CREATE INDEX idx_reading_log_date ON reading_log(date);
"#;

// Custom reading plans (F4.2). A plan the reader built lives in user.db
// and mirrors the content-db shape (reading_plans / reading_plan_readings
// in CONTENT_MIGRATION_0002) so one query path serves both; its `code` is
// stored with the `user:` prefix the app exposes, so reading_plan_progress
// and reading_plan_completions key it exactly as they key a bundled plan.
// `reading_weekdays` is an optional comma list of ISO weekdays (1 = Monday
// ... 7 = Sunday) the plan is read on; null means every day.
//
// reading_plan_schedule is the per-day date map deferred from F3.3: a row
// pins `day_number` of any plan (bundled or custom) to a calendar date. A
// day without a row falls on start_date + (day_number - 1), as before. The
// map carries a weekday plan's whole calendar and the "spread over seven
// days" catch-up mode's re-dated days.
pub const USER_MIGRATION_0014: &str = r#"
CREATE TABLE user_reading_plans (
  id                INTEGER PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  description       TEXT,
  length_days       INTEGER NOT NULL,
  reading_weekdays  TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE user_reading_plan_readings (
  id             INTEGER PRIMARY KEY,
  plan_id        INTEGER NOT NULL REFERENCES user_reading_plans(id) ON DELETE CASCADE,
  day_number     INTEGER NOT NULL,
  sort_order     INTEGER NOT NULL,
  book_id        INTEGER NOT NULL,
  chapter_start  INTEGER NOT NULL,
  verse_start    INTEGER,
  chapter_end    INTEGER NOT NULL,
  verse_end      INTEGER,
  label          TEXT NOT NULL
);
CREATE INDEX idx_user_reading_plan_readings_day ON user_reading_plan_readings(plan_id, day_number, sort_order);

CREATE TABLE reading_plan_schedule (
  plan_code   TEXT NOT NULL,
  day_number  INTEGER NOT NULL,
  date        TEXT NOT NULL,
  PRIMARY KEY (plan_code, day_number)
);
CREATE INDEX idx_reading_plan_schedule_date ON reading_plan_schedule(plan_code, date);
"#;

// Sermon Builder (SB0.1). All new tables; nothing here touches the tables
// the old Sermon Notes feature used -- USER_MIGRATION_0010 already dropped
// every one of them, so those names are simply free again.
//
// A sermon is one tiptap document (`body`) whose passage blocks are
// *references*, not copied verse text: `translation_id` is the translation
// every block renders in, so switching it re-renders the whole manuscript.
// `stage` is the prep track's six steps, stored so the Sermons page and the
// Today block can read a sermon's progress without parsing its body.
//
// sermon_passages is the body's references made queryable: role `text` is
// the sermon's own passage (set in the header), `supporting` a passage block
// in the manuscript, `mentioned` a reference typed in prose. All three are
// re-derived from the body on every save, the way note_refs are, so the
// table can never drift from the document.
//
// sermon_sources is one row per citation block, keyed by a source identity
// the app can reopen (`commentary:<entryId>`, `westminster:<sectionId>`,
// `strongs:G1343`, `dictionary:<slug>`, `encyclopedia:<slug>`,
// `atlas:<place-slug>`, `resource:<id>:<page>`, `illustration:<id>`) -- that
// string is what "Open source" hands back to openContent. This doubles as
// the sermon's bibliography. The `kind` CHECK listing those is widened in
// USER_MIGRATION_0018, not here.
//
// sermon_events logs rehearsals and preachings in one table because both
// are timed runs of the same manuscript, and both feed the measured
// speaking rate (SB2.4): words spoken over seconds elapsed.
//
// Illustrations are a library of their own (a story is reused across
// sermons and outlives any one of them); illustration_uses records where
// each went. Sermons and illustrations both soft-delete into the Trash, so
// they carry `deleted_at` with the usual partial index.
pub const USER_MIGRATION_0015: &str = r#"
CREATE TABLE sermon_series (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT,
  plan_code    TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE sermons (
  id              INTEGER PRIMARY KEY,
  title           TEXT NOT NULL,
  big_idea        TEXT,
  body            TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','preached','archived')),
  stage           TEXT NOT NULL DEFAULT 'text' CHECK(stage IN ('text','study','outline','manuscript','rehearsed','preached')),
  preach_date     TEXT,
  series_id       INTEGER REFERENCES sermon_series(id) ON DELETE SET NULL,
  series_order    INTEGER,
  venue           TEXT,
  preacher        TEXT,
  translation_id  INTEGER,
  target_minutes  INTEGER,
  reflection      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT
);
CREATE INDEX idx_sermons_deleted ON sermons(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_sermons_preach_date ON sermons(preach_date);
CREATE INDEX idx_sermons_series ON sermons(series_id, series_order);

CREATE TABLE sermon_passages (
  id           INTEGER PRIMARY KEY,
  sermon_id    INTEGER NOT NULL REFERENCES sermons(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK(role IN ('text','supporting','mentioned')),
  book_id      INTEGER NOT NULL,
  chapter      INTEGER NOT NULL,
  verse_start  INTEGER,
  verse_end    INTEGER,
  sort_order   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_sermon_passages_passage ON sermon_passages(book_id, chapter);
CREATE INDEX idx_sermon_passages_sermon ON sermon_passages(sermon_id, role, sort_order);

CREATE TABLE sermon_sources (
  id          INTEGER PRIMARY KEY,
  sermon_id   INTEGER NOT NULL REFERENCES sermons(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK(kind IN ('commentary','confession','strongs','dictionary','resource','crossref','illustration')),
  ref_id      TEXT,
  label       TEXT NOT NULL,
  excerpt     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_sermon_sources_sermon ON sermon_sources(sermon_id, sort_order);

CREATE TABLE sermon_tags (
  sermon_id  INTEGER NOT NULL REFERENCES sermons(id) ON DELETE CASCADE,
  tag        TEXT NOT NULL,
  UNIQUE(sermon_id, tag)
);
CREATE INDEX idx_sermon_tags_tag ON sermon_tags(tag);

CREATE TABLE sermon_events (
  id                INTEGER PRIMARY KEY,
  sermon_id         INTEGER NOT NULL REFERENCES sermons(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK(kind IN ('rehearsal','preaching')),
  date              TEXT NOT NULL,
  venue             TEXT,
  duration_seconds  INTEGER,
  word_count        INTEGER,
  notes             TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_sermon_events_sermon ON sermon_events(sermon_id, date);
CREATE INDEX idx_sermon_events_date ON sermon_events(date);

CREATE TABLE illustrations (
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  source_label  TEXT,
  source_ref    TEXT,
  kind          TEXT NOT NULL DEFAULT 'illustration' CHECK(kind IN ('illustration','quote')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX idx_illustrations_deleted ON illustrations(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE illustration_tags (
  illustration_id  INTEGER NOT NULL REFERENCES illustrations(id) ON DELETE CASCADE,
  tag              TEXT NOT NULL,
  UNIQUE(illustration_id, tag)
);
CREATE INDEX idx_illustration_tags_tag ON illustration_tags(tag);

CREATE TABLE illustration_uses (
  id               INTEGER PRIMARY KEY,
  illustration_id  INTEGER NOT NULL REFERENCES illustrations(id) ON DELETE CASCADE,
  sermon_id        INTEGER NOT NULL REFERENCES sermons(id) ON DELETE CASCADE,
  used_at          TEXT NOT NULL,
  UNIQUE(illustration_id, sermon_id)
);
CREATE INDEX idx_illustration_uses_sermon ON illustration_uses(sermon_id);

CREATE VIRTUAL TABLE sermons_fts USING fts5(
  title, big_idea, body, reflection, content='sermons', content_rowid='id'
);
CREATE TRIGGER sermons_search_ai AFTER INSERT ON sermons BEGIN
  INSERT INTO sermons_fts(rowid, title, big_idea, body, reflection)
  VALUES (new.id, new.title, new.big_idea, new.body, new.reflection);
END;
CREATE TRIGGER sermons_search_au AFTER UPDATE ON sermons BEGIN
  INSERT INTO sermons_fts(sermons_fts, rowid, title, big_idea, body, reflection)
  VALUES('delete', old.id, old.title, old.big_idea, old.body, old.reflection);
  INSERT INTO sermons_fts(rowid, title, big_idea, body, reflection)
  VALUES (new.id, new.title, new.big_idea, new.body, new.reflection);
END;
CREATE TRIGGER sermons_search_ad AFTER DELETE ON sermons BEGIN
  INSERT INTO sermons_fts(sermons_fts, rowid, title, big_idea, body, reflection)
  VALUES('delete', old.id, old.title, old.big_idea, old.body, old.reflection);
END;

CREATE VIRTUAL TABLE illustrations_fts USING fts5(
  title, body, source_label, content='illustrations', content_rowid='id'
);
CREATE TRIGGER illustrations_search_ai AFTER INSERT ON illustrations BEGIN
  INSERT INTO illustrations_fts(rowid, title, body, source_label)
  VALUES (new.id, new.title, new.body, new.source_label);
END;
CREATE TRIGGER illustrations_search_au AFTER UPDATE ON illustrations BEGIN
  INSERT INTO illustrations_fts(illustrations_fts, rowid, title, body, source_label)
  VALUES('delete', old.id, old.title, old.body, old.source_label);
  INSERT INTO illustrations_fts(rowid, title, body, source_label)
  VALUES (new.id, new.title, new.body, new.source_label);
END;
CREATE TRIGGER illustrations_search_ad AFTER DELETE ON illustrations BEGIN
  INSERT INTO illustrations_fts(illustrations_fts, rowid, title, body, source_label)
  VALUES('delete', old.id, old.title, old.body, old.source_label);
END;
"#;

// The four search indexes over rich text held the markup itself. Everything
// a reader writes in the editor is stored as HTML, and these tables indexed
// that HTML, so "strong" matched every note with a bold word in it, "href"
// matched every one with a link, and a word broken by formatting
// (`sw<em>orn</em>`) was indexed as two halves and could not be found at all.
//
// Each index is now built from `html_text(body)` -- the words, with the tags
// left out (see `crate::text`, registered on the connection by
// `db::register_functions`). That means they can no longer be
// external-content tables: fts5 reads a snippet back from the content table,
// so an index whose text differs from the column it points at returns
// nonsense. They store their own text instead, which is also what makes a
// search result readable: `snippet()` now returns words rather than tags.
//
// Only the rich-text columns go through it. A sermon's title and an
// illustration's source line are typed into plain inputs and are indexed as
// they are. The indexes still hold soft-deleted rows, exactly as before --
// every search filters those out by joining the base table.
pub const USER_MIGRATION_0016: &str = r#"
DROP TRIGGER notes_search_ai;
DROP TRIGGER notes_search_au;
DROP TRIGGER notes_search_ad;
DROP TABLE notes_fts;
CREATE VIRTUAL TABLE notes_fts USING fts5(body);
INSERT INTO notes_fts(rowid, body) SELECT id, html_text(body) FROM notes;
CREATE TRIGGER notes_search_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, body) VALUES (new.id, html_text(new.body));
END;
CREATE TRIGGER notes_search_au AFTER UPDATE ON notes BEGIN
  DELETE FROM notes_fts WHERE rowid = old.id;
  INSERT INTO notes_fts(rowid, body) VALUES (new.id, html_text(new.body));
END;
CREATE TRIGGER notes_search_ad AFTER DELETE ON notes BEGIN
  DELETE FROM notes_fts WHERE rowid = old.id;
END;

DROP TRIGGER chapter_notes_search_ai;
DROP TRIGGER chapter_notes_search_au;
DROP TRIGGER chapter_notes_search_ad;
DROP TABLE chapter_notes_fts;
CREATE VIRTUAL TABLE chapter_notes_fts USING fts5(body);
INSERT INTO chapter_notes_fts(rowid, body) SELECT id, html_text(body) FROM chapter_notes;
CREATE TRIGGER chapter_notes_search_ai AFTER INSERT ON chapter_notes BEGIN
  INSERT INTO chapter_notes_fts(rowid, body) VALUES (new.id, html_text(new.body));
END;
CREATE TRIGGER chapter_notes_search_au AFTER UPDATE ON chapter_notes BEGIN
  DELETE FROM chapter_notes_fts WHERE rowid = old.id;
  INSERT INTO chapter_notes_fts(rowid, body) VALUES (new.id, html_text(new.body));
END;
CREATE TRIGGER chapter_notes_search_ad AFTER DELETE ON chapter_notes BEGIN
  DELETE FROM chapter_notes_fts WHERE rowid = old.id;
END;

DROP TRIGGER sermons_search_ai;
DROP TRIGGER sermons_search_au;
DROP TRIGGER sermons_search_ad;
DROP TABLE sermons_fts;
CREATE VIRTUAL TABLE sermons_fts USING fts5(title, big_idea, body, reflection);
INSERT INTO sermons_fts(rowid, title, big_idea, body, reflection)
  SELECT id, title, big_idea, html_text(body), reflection FROM sermons;
CREATE TRIGGER sermons_search_ai AFTER INSERT ON sermons BEGIN
  INSERT INTO sermons_fts(rowid, title, big_idea, body, reflection)
  VALUES (new.id, new.title, new.big_idea, html_text(new.body), new.reflection);
END;
CREATE TRIGGER sermons_search_au AFTER UPDATE ON sermons BEGIN
  DELETE FROM sermons_fts WHERE rowid = old.id;
  INSERT INTO sermons_fts(rowid, title, big_idea, body, reflection)
  VALUES (new.id, new.title, new.big_idea, html_text(new.body), new.reflection);
END;
CREATE TRIGGER sermons_search_ad AFTER DELETE ON sermons BEGIN
  DELETE FROM sermons_fts WHERE rowid = old.id;
END;

DROP TRIGGER illustrations_search_ai;
DROP TRIGGER illustrations_search_au;
DROP TRIGGER illustrations_search_ad;
DROP TABLE illustrations_fts;
CREATE VIRTUAL TABLE illustrations_fts USING fts5(title, body, source_label);
INSERT INTO illustrations_fts(rowid, title, body, source_label)
  SELECT id, title, html_text(body), source_label FROM illustrations;
CREATE TRIGGER illustrations_search_ai AFTER INSERT ON illustrations BEGIN
  INSERT INTO illustrations_fts(rowid, title, body, source_label)
  VALUES (new.id, new.title, html_text(new.body), new.source_label);
END;
CREATE TRIGGER illustrations_search_au AFTER UPDATE ON illustrations BEGIN
  DELETE FROM illustrations_fts WHERE rowid = old.id;
  INSERT INTO illustrations_fts(rowid, title, body, source_label)
  VALUES (new.id, new.title, html_text(new.body), new.source_label);
END;
CREATE TRIGGER illustrations_search_ad AFTER DELETE ON illustrations BEGIN
  DELETE FROM illustrations_fts WHERE rowid = old.id;
END;
"#;

// A resource row that stands for a book shipped with the app rather than one
// the reader added. `library_key` is the bundled file's name, which is what
// ties the row to its text in content.db's `library_resources` and to the
// file itself beside the executable; it is null for everything a reader adds,
// and those keep working exactly as before.
//
// The row exists at all because tags, passage links, resource links and
// reading positions all hang off `resources(id)`: without it, a shipped book
// would be the one kind of book nobody could tag.
pub const USER_MIGRATION_0017: &str = r#"
ALTER TABLE resources ADD COLUMN library_key TEXT;
CREATE UNIQUE INDEX idx_resources_library_key ON resources(library_key) WHERE library_key IS NOT NULL;
"#;

// Encyclopedia articles and atlas places become citable in a sermon.
//
// The `kind` CHECK lives in USER_MIGRATION_0015, which has shipped, so it
// cannot be edited in place -- SQLite has no ALTER TABLE ... DROP CONSTRAINT,
// and rewriting a migration a reader's database has already run would leave
// their `user_version` past it and the constraint unchanged. Hence the
// twelve-step rebuild, and hence the index recreated at the end: it belongs
// to the old table and goes with it.
pub const USER_MIGRATION_0018: &str = r#"
CREATE TABLE sermon_sources_new (
  id          INTEGER PRIMARY KEY,
  sermon_id   INTEGER NOT NULL REFERENCES sermons(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK(kind IN ('commentary','confession','strongs','dictionary','resource','crossref','illustration','encyclopedia','atlas')),
  ref_id      TEXT,
  label       TEXT NOT NULL,
  excerpt     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
INSERT INTO sermon_sources_new (id, sermon_id, kind, ref_id, label, excerpt, sort_order, created_at)
  SELECT id, sermon_id, kind, ref_id, label, excerpt, sort_order, created_at FROM sermon_sources;
DROP TABLE sermon_sources;
ALTER TABLE sermon_sources_new RENAME TO sermon_sources;
CREATE INDEX idx_sermon_sources_sermon ON sermon_sources(sermon_id, sort_order);
"#;

// The same citations for the reader's own books (see LIBRARY_MIGRATION_0002),
// found when a book's text is extracted, and for books added before this
// existed, once, in the background at launch.
pub const USER_MIGRATION_0019: &str = r#"
CREATE TABLE resource_citations (
  id           INTEGER PRIMARY KEY,
  resource_id  INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  char_offset  INTEGER NOT NULL,
  label        TEXT NOT NULL,
  occurrence   INTEGER NOT NULL,
  context      TEXT NOT NULL,
  book_id      INTEGER NOT NULL,
  chapter      INTEGER NOT NULL,
  verse_start  INTEGER NOT NULL,
  verse_end    INTEGER NOT NULL
);
CREATE INDEX idx_resource_citations_passage ON resource_citations(book_id, chapter, verse_start);
CREATE INDEX idx_resource_citations_resource ON resource_citations(resource_id);
"#;

// Which of the reader's books have been scanned for citations, whatever the
// scan found: without it a book that cites no Scripture looked unscanned and
// was read again in full at every launch.
pub const USER_MIGRATION_0020: &str = r#"
CREATE TABLE resource_citation_scans (
  resource_id INTEGER PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE
);
INSERT OR IGNORE INTO resource_citation_scans (resource_id) SELECT DISTINCT resource_id FROM resource_citations;
"#;

// Memory, grown up:
//
// - memory_passages: a psalm or a chapter learned a part at a time. Its
//   parts are ordinary memory_verses rows carrying its id; the next part is
//   added once the one before is learned, and the whole passage last, to
//   say through. A card that was in the deck before is not taken over by a
//   passage (it keeps passage_id NULL), and deleting a passage deletes its
//   parts, which is why the reference is SET NULL rather than CASCADE:
//   delete_passage removes them itself.
// - set_name: a named set a card came in with ("The Romans Road",
//   "Family", "Series: Romans"), to filter and practise by.
// - ask_reference: also practise where the verse is -- shown the words,
//   say the reference -- on alternate reviews of the same card.
// - memory_reviews: one row per review, for either deck. Until now the only
//   record was each card's last_reviewed_at, so a day's reviews vanished
//   from the history as soon as those cards were reviewed again. Seeded
//   with those last reviews, the one record there is of the past.
pub const USER_MIGRATION_0021: &str = r#"
CREATE TABLE memory_passages (
  id             INTEGER PRIMARY KEY,
  book_id        INTEGER NOT NULL,
  chapter        INTEGER NOT NULL,
  verse_start    INTEGER NOT NULL,
  verse_end      INTEGER NOT NULL,
  translation_id INTEGER,
  chunk_size     INTEGER NOT NULL DEFAULT 2 CHECK(chunk_size BETWEEN 1 AND 8),
  mode           TEXT NOT NULL DEFAULT 'first-letter' CHECK(mode IN ('first-letter','blank-word','type-it')),
  set_name       TEXT,
  created_at     TEXT NOT NULL
);

ALTER TABLE memory_verses ADD COLUMN passage_id INTEGER REFERENCES memory_passages(id) ON DELETE SET NULL;
ALTER TABLE memory_verses ADD COLUMN set_name TEXT;
ALTER TABLE memory_verses ADD COLUMN ask_reference INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_memory_verses_passage ON memory_verses(passage_id);

CREATE TABLE memory_reviews (
  id          INTEGER PRIMARY KEY,
  deck        TEXT NOT NULL CHECK(deck IN ('scripture','catechism')),
  card_id     INTEGER NOT NULL,
  quality     INTEGER NOT NULL,
  reviewed_at TEXT NOT NULL
);
CREATE INDEX idx_memory_reviews_at ON memory_reviews(reviewed_at);
INSERT INTO memory_reviews (deck, card_id, quality, reviewed_at)
  SELECT 'scripture', id, 4, last_reviewed_at FROM memory_verses WHERE last_reviewed_at IS NOT NULL;
INSERT INTO memory_reviews (deck, card_id, quality, reviewed_at)
  SELECT 'catechism', id, 4, last_reviewed_at FROM catechism_memory WHERE last_reviewed_at IS NOT NULL;
"#;

pub const USER_MIGRATIONS: &[&str] = &[
    USER_MIGRATION_0001,
    USER_MIGRATION_0002,
    USER_MIGRATION_0003,
    USER_MIGRATION_0004,
    USER_MIGRATION_0005,
    USER_MIGRATION_0006,
    USER_MIGRATION_0007,
    USER_MIGRATION_0008,
    USER_MIGRATION_0009,
    USER_MIGRATION_0010,
    USER_MIGRATION_0011,
    USER_MIGRATION_0012,
    USER_MIGRATION_0013,
    USER_MIGRATION_0014,
    USER_MIGRATION_0015,
    USER_MIGRATION_0016,
    USER_MIGRATION_0017,
    USER_MIGRATION_0018,
    USER_MIGRATION_0019,
    USER_MIGRATION_0020,
    USER_MIGRATION_0021,
];
