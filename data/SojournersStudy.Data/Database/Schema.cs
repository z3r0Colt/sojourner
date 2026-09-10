namespace SojournersStudy.Data.Database;

/// <summary>
/// Idempotent DDL for the whole schema. No versioned migration framework yet
/// (`CREATE TABLE IF NOT EXISTS` is safe to re-run on every connection open):
/// there is no shipped data to migrate at this stage. Introduce real
/// migrations (mirroring the old Rust app's append-only PRAGMA
/// user_version approach) once a schema change needs to run against
/// existing user data.
/// </summary>
internal static class Schema
{
    public const string Sql = """
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS Bible_Translations (
            translation_id INTEGER PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            year INTEGER,
            is_public_domain INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS Bible_Verses (
            bcv_id INTEGER NOT NULL,
            translation_id INTEGER NOT NULL REFERENCES Bible_Translations(translation_id),
            verse_text TEXT NOT NULL,
            PRIMARY KEY (bcv_id, translation_id)
        ) WITHOUT ROWID;

        CREATE TABLE IF NOT EXISTS Original_Texts (
            bcv_id INTEGER NOT NULL,
            word_order INTEGER NOT NULL,
            surface_word TEXT NOT NULL,
            lemma TEXT,
            strongs_number TEXT,
            morph_code TEXT,
            gloss TEXT,
            PRIMARY KEY (bcv_id, word_order)
        ) WITHOUT ROWID;

        CREATE TABLE IF NOT EXISTS Works_Catalog (
            work_id INTEGER PRIMARY KEY,
            author TEXT NOT NULL,
            title TEXT NOT NULL,
            year INTEGER,
            is_public_domain INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS Work_Content_Blocks (
            block_id INTEGER PRIMARY KEY,
            work_id INTEGER NOT NULL REFERENCES Works_Catalog(work_id),
            start_bcv INTEGER NOT NULL,
            end_bcv INTEGER NOT NULL,
            body_text TEXT NOT NULL,
            sort_order INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_work_content_blocks_range ON Work_Content_Blocks(start_bcv, end_bcv);
        CREATE INDEX IF NOT EXISTS idx_work_content_blocks_work ON Work_Content_Blocks(work_id, sort_order);

        CREATE TABLE IF NOT EXISTS Confessional_Documents (
            document_id INTEGER PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS Confessional_Proof_Texts (
            id INTEGER PRIMARY KEY,
            bcv_id INTEGER NOT NULL,
            document_id INTEGER NOT NULL REFERENCES Confessional_Documents(document_id),
            chapter_num INTEGER NOT NULL,
            article_num INTEGER,
            UNIQUE (bcv_id, document_id, chapter_num, article_num)
        );
        CREATE INDEX IF NOT EXISTS idx_confessional_proof_texts_bcv ON Confessional_Proof_Texts(bcv_id);
        CREATE INDEX IF NOT EXISTS idx_confessional_proof_texts_doc ON Confessional_Proof_Texts(document_id, chapter_num, article_num);

        -- The architecture doc's schema only described the verse<->citation
        -- mapping (Confessional_Proof_Texts above), not where the
        -- confession's own text lives -- there is nowhere to fetch "WCF 6.1"'s
        -- actual wording from otherwise. chapter_num/article_num are reused
        -- loosely per document shape: WCF chapter/section, Larger/Shorter
        -- Catechism question number (article_num null), Heidelberg Lord's
        -- Day/question, Belgic/Canons of Dort article number.
        CREATE TABLE IF NOT EXISTS Confessional_Sections (
            id INTEGER PRIMARY KEY,
            document_id INTEGER NOT NULL REFERENCES Confessional_Documents(document_id),
            chapter_num INTEGER,
            article_num INTEGER,
            heading TEXT,
            content_text TEXT NOT NULL,
            sort_order INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_confessional_sections_doc ON Confessional_Sections(document_id, sort_order);

        -- Not in the architecture doc's schema section at all -- added here
        -- since the Sermon Builder (section 7) needs somewhere to persist
        -- the manuscript, passage, and Law/Gospel matrix fields.
        CREATE TABLE IF NOT EXISTS Sermon_Manuscripts (
            sermon_id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            passage_start_bcv INTEGER,
            passage_end_bcv INTEGER,
            law_text TEXT,
            gospel_text TEXT,
            body_rtf TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- The architecture doc calls for Thayer's/BDB lexicon flyouts on
        -- interlinear words, but no clean public-domain Thayer's/BDB text
        -- was sourced this session. Strong's Dictionary (reference/strongs/
        -- greek.xml, hebrew.xml -- James Strong, 1890/1894, public domain)
        -- is real, clean, structured lexicon data keyed by the same
        -- strongs_number already on Original_Texts, so it fills the same
        -- functional need honestly labeled as what it actually is.
        CREATE TABLE IF NOT EXISTS Lexicon_Entries (
            strongs_id TEXT PRIMARY KEY,
            original_word TEXT NOT NULL,
            transliteration TEXT,
            pronunciation TEXT,
            definition TEXT NOT NULL,
            kjv_usage TEXT
        );
        """;
}
