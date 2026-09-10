using System.Data;
using Dapper;
using SojournersStudy.Data.Models;

namespace SojournersStudy.Data.Repositories;

public static class OriginalTextRepository
{
    public static void UpsertWord(IDbConnection db, OriginalTextWord word)
    {
        const string sql = """
            INSERT INTO Original_Texts (bcv_id, word_order, surface_word, lemma, strongs_number, morph_code)
            VALUES (@BcvId, @WordOrder, @SurfaceWord, @Lemma, @StrongsNumber, @MorphCode)
            ON CONFLICT (bcv_id, word_order) DO UPDATE SET
                surface_word = excluded.surface_word,
                lemma = excluded.lemma,
                strongs_number = excluded.strongs_number,
                morph_code = excluded.morph_code;
            """;
        db.Execute(sql, word);
    }

    public static IEnumerable<OriginalTextWord> GetWordsForVerse(IDbConnection db, int bcvId) =>
        db.Query<OriginalTextWord>(
            """
            SELECT bcv_id AS BcvId, word_order AS WordOrder, surface_word AS SurfaceWord,
                   lemma AS Lemma, strongs_number AS StrongsNumber, morph_code AS MorphCode
            FROM Original_Texts
            WHERE bcv_id = @bcvId
            ORDER BY word_order;
            """,
            new { bcvId });

    public static IEnumerable<OriginalTextWord> GetWordsForChapter(IDbConnection db, int book, int chapter)
    {
        int start = BcvReference.ChapterStart(book, chapter);
        int end = BcvReference.ChapterEnd(book, chapter);
        return db.Query<OriginalTextWord>(
            """
            SELECT bcv_id AS BcvId, word_order AS WordOrder, surface_word AS SurfaceWord,
                   lemma AS Lemma, strongs_number AS StrongsNumber, morph_code AS MorphCode
            FROM Original_Texts
            WHERE bcv_id BETWEEN @start AND @end
            ORDER BY bcv_id, word_order;
            """,
            new { start, end });
    }
}
