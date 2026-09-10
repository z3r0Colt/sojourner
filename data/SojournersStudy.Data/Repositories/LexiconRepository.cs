using System.Data;
using Dapper;
using SojournersStudy.Data.Models;

namespace SojournersStudy.Data.Repositories;

public static class LexiconRepository
{
    public static void UpsertEntry(IDbConnection db, LexiconEntry entry)
    {
        const string sql = """
            INSERT INTO Lexicon_Entries (strongs_id, original_word, transliteration, pronunciation, definition, kjv_usage)
            VALUES (@StrongsId, @OriginalWord, @Transliteration, @Pronunciation, @Definition, @KjvUsage)
            ON CONFLICT (strongs_id) DO UPDATE SET
                original_word = excluded.original_word,
                transliteration = excluded.transliteration,
                pronunciation = excluded.pronunciation,
                definition = excluded.definition,
                kjv_usage = excluded.kjv_usage;
            """;
        db.Execute(sql, entry);
    }

    public static LexiconEntry? GetEntry(IDbConnection db, string strongsId) =>
        db.QuerySingleOrDefault<LexiconEntry>(
            """
            SELECT strongs_id AS StrongsId, original_word AS OriginalWord, transliteration AS Transliteration,
                   pronunciation AS Pronunciation, definition AS Definition, kjv_usage AS KjvUsage
            FROM Lexicon_Entries
            WHERE strongs_id = @strongsId;
            """,
            new { strongsId });
}
