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

pub const CONTENT_MIGRATIONS: &[&str] =
    &[CONTENT_MIGRATION_0001, CONTENT_MIGRATION_0002, CONTENT_MIGRATION_0003, CONTENT_MIGRATION_0004];

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

pub const USER_MIGRATIONS: &[&str] = &[USER_MIGRATION_0001, USER_MIGRATION_0002, USER_MIGRATION_0003];
