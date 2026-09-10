using System.Data;
using Dapper;
using SojournersStudy.Data.Models;

namespace SojournersStudy.Data.Repositories;

public static class BibleRepository
{
    /// Upsert by `code` (its natural key) so an importer can be re-run without violating the UNIQUE constraint.
    public static int UpsertTranslation(IDbConnection db, BibleTranslation translation)
    {
        const string sql = """
            INSERT INTO Bible_Translations (code, display_name, year, is_public_domain)
            VALUES (@Code, @DisplayName, @Year, @IsPublicDomain)
            ON CONFLICT (code) DO UPDATE SET display_name = excluded.display_name, year = excluded.year, is_public_domain = excluded.is_public_domain
            RETURNING translation_id;
            """;
        return db.ExecuteScalar<int>(sql, translation);
    }

    public static IEnumerable<BibleTranslation> GetTranslations(IDbConnection db) =>
        db.Query<BibleTranslation>(
            """
            SELECT translation_id AS TranslationId, code AS Code, display_name AS DisplayName,
                   year AS Year, is_public_domain AS IsPublicDomain
            FROM Bible_Translations
            ORDER BY display_name;
            """);

    public static BibleTranslation? GetTranslationByCode(IDbConnection db, string code) =>
        db.QuerySingleOrDefault<BibleTranslation>(
            """
            SELECT translation_id AS TranslationId, code AS Code, display_name AS DisplayName,
                   year AS Year, is_public_domain AS IsPublicDomain
            FROM Bible_Translations
            WHERE code = @code;
            """,
            new { code });

    public static void UpsertVerse(IDbConnection db, BibleVerse verse)
    {
        const string sql = """
            INSERT INTO Bible_Verses (bcv_id, translation_id, verse_text)
            VALUES (@BcvId, @TranslationId, @VerseText)
            ON CONFLICT (bcv_id, translation_id) DO UPDATE SET verse_text = excluded.verse_text;
            """;
        db.Execute(sql, verse);
    }

    public static BibleVerse? GetVerse(IDbConnection db, int bcvId, int translationId) =>
        db.QuerySingleOrDefault<BibleVerse>(
            """
            SELECT bcv_id AS BcvId, translation_id AS TranslationId, verse_text AS VerseText
            FROM Bible_Verses
            WHERE bcv_id = @bcvId AND translation_id = @translationId;
            """,
            new { bcvId, translationId });

    /// Verses for a whole chapter, in verse order, via the bcv_id range trick
    /// (`BcvReference.ChapterStart`/`ChapterEnd`) rather than decoding each row.
    public static IEnumerable<BibleVerse> GetChapterVerses(IDbConnection db, int book, int chapter, int translationId)
    {
        int start = BcvReference.ChapterStart(book, chapter);
        int end = BcvReference.ChapterEnd(book, chapter);
        return db.Query<BibleVerse>(
            """
            SELECT bcv_id AS BcvId, translation_id AS TranslationId, verse_text AS VerseText
            FROM Bible_Verses
            WHERE translation_id = @translationId AND bcv_id BETWEEN @start AND @end
            ORDER BY bcv_id;
            """,
            new { translationId, start, end });
    }
}
