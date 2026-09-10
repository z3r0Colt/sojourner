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
        """;
}
