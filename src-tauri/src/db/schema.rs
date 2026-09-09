pub const MIGRATION_0001: &str = r#"
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

CREATE TABLE highlights (
  id             INTEGER PRIMARY KEY,
  book_id        INTEGER NOT NULL REFERENCES books(id),
  chapter        INTEGER NOT NULL,
  verse_start    INTEGER NOT NULL,
  verse_end      INTEGER NOT NULL,
  char_start     INTEGER,
  char_end       INTEGER,
  color          TEXT NOT NULL,
  style          TEXT NOT NULL DEFAULT 'highlight',
  translation_id INTEGER REFERENCES translations(id),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_highlights_lookup ON highlights(book_id, chapter);

CREATE TABLE notes (
  id             INTEGER PRIMARY KEY,
  book_id        INTEGER NOT NULL REFERENCES books(id),
  chapter        INTEGER NOT NULL,
  verse_start    INTEGER NOT NULL,
  verse_end      INTEGER NOT NULL,
  body           TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_notes_lookup ON notes(book_id, chapter);

CREATE TABLE bookmarks (
  id          INTEGER PRIMARY KEY,
  book_id     INTEGER NOT NULL REFERENCES books(id),
  chapter     INTEGER NOT NULL,
  verse       INTEGER,
  label       TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE passage_links (
  id                     INTEGER PRIMARY KEY,
  from_book_id           INTEGER NOT NULL REFERENCES books(id),
  from_chapter           INTEGER NOT NULL,
  from_verse_start       INTEGER NOT NULL,
  from_verse_end         INTEGER NOT NULL,
  to_book_id             INTEGER REFERENCES books(id),
  to_chapter             INTEGER,
  to_verse_start         INTEGER,
  to_verse_end           INTEGER,
  to_commentary_entry_id INTEGER REFERENCES commentary_entries(id),
  note                   TEXT,
  created_at             TEXT NOT NULL
);

CREATE TABLE reading_position (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  translation_id INTEGER REFERENCES translations(id),
  book_id        INTEGER REFERENCES books(id),
  chapter        INTEGER,
  verse          INTEGER,
  updated_at     TEXT NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

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

pub const MIGRATION_0002: &str = r#"
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
"#;

pub const MIGRATION_0003: &str = r#"
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
  book_id      INTEGER NOT NULL REFERENCES books(id),
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
  book_id    INTEGER NOT NULL REFERENCES books(id),
  chapter    INTEGER NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_chapter_notes_passage ON chapter_notes(book_id, chapter);

ALTER TABLE notes ADD COLUMN highlight_id INTEGER REFERENCES highlights(id);

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
"#;

pub const MIGRATION_0004: &str = r#"
CREATE TABLE footnotes (
  id             INTEGER PRIMARY KEY,
  translation_id INTEGER NOT NULL REFERENCES translations(id) ON DELETE CASCADE,
  book_id        INTEGER NOT NULL REFERENCES books(id),
  chapter        INTEGER NOT NULL,
  verse          INTEGER NOT NULL,
  sort_order     INTEGER NOT NULL,
  marker         TEXT NOT NULL,
  text           TEXT NOT NULL
);
CREATE INDEX idx_footnotes_lookup ON footnotes(translation_id, book_id, chapter, verse);
"#;

pub const MIGRATION_0005: &str = r#"
ALTER TABLE footnotes ADD COLUMN char_offset INTEGER;
"#;

// commentary_entries had no index on section_id, so every per-section delete
// during a commentary re-import (see thml.rs's insert_section) was a full
// table scan -- painfully slow once the table holds 100k+ rows across
// multiple large commentaries.
pub const MIGRATION_0006: &str = r#"
CREATE INDEX idx_commentary_entries_section ON commentary_entries(section_id);
"#;

// Commentaries on the Westminster Confession (Hodge, Shaw), keyed by WCF
// chapter number rather than by westminster_sections.id -- section-level
// granularity in the source texts is inconsistent enough (see the importer)
// that per-chapter is the reliable unit; `section` is populated when a
// source's own text does cleanly split by WCF section (e.g. Shaw), and left
// NULL when a source is stored as one whole-chapter block (e.g. Hodge).
pub const MIGRATION_0007: &str = r#"
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
"#;

pub const MIGRATIONS: &[&str] = &[
    MIGRATION_0001,
    MIGRATION_0002,
    MIGRATION_0003,
    MIGRATION_0004,
    MIGRATION_0005,
    MIGRATION_0006,
    MIGRATION_0007,
];
