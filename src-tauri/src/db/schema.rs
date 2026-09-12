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

// Translation-transparency flag: most bundled translations are true public
// domain, but a couple (NASB, NKJV) are modern copyrighted texts the app
// bundles under the operator's own license rather than PD status. Default
// 'public_domain' covers the common case; the importer backfills 'licensed'
// for the known non-PD codes right after import (see
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
];

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
// `strongs:G1343`, `dictionary:<slug>`, `resource:<id>:<page>`,
// `illustration:<id>`) -- that string is what "Open source" hands back to
// openContent. This doubles as the sermon's bibliography.
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
];
