using System.Data;
using Dapper;
using SojournersStudy.Data.Models;

namespace SojournersStudy.Data.Repositories;

public static class SermonRepository
{
    public static int InsertSermon(IDbConnection db, SermonManuscript sermon)
    {
        const string sql = """
            INSERT INTO Sermon_Manuscripts (title, passage_start_bcv, passage_end_bcv, law_text, gospel_text, body_rtf, created_at, updated_at)
            VALUES (@Title, @PassageStartBcv, @PassageEndBcv, @LawText, @GospelText, @BodyRtf, @CreatedAt, @UpdatedAt)
            RETURNING sermon_id;
            """;
        return db.ExecuteScalar<int>(sql, sermon);
    }

    public static void UpdateSermon(IDbConnection db, SermonManuscript sermon)
    {
        const string sql = """
            UPDATE Sermon_Manuscripts
            SET title = @Title, passage_start_bcv = @PassageStartBcv, passage_end_bcv = @PassageEndBcv,
                law_text = @LawText, gospel_text = @GospelText, body_rtf = @BodyRtf, updated_at = @UpdatedAt
            WHERE sermon_id = @SermonId;
            """;
        db.Execute(sql, sermon);
    }

    public static SermonManuscript? GetSermon(IDbConnection db, int sermonId) =>
        db.QuerySingleOrDefault<SermonManuscript>(
            """
            SELECT sermon_id AS SermonId, title AS Title, passage_start_bcv AS PassageStartBcv, passage_end_bcv AS PassageEndBcv,
                   law_text AS LawText, gospel_text AS GospelText, body_rtf AS BodyRtf, created_at AS CreatedAt, updated_at AS UpdatedAt
            FROM Sermon_Manuscripts
            WHERE sermon_id = @sermonId;
            """,
            new { sermonId });

    public static IEnumerable<SermonManuscript> GetAllSermons(IDbConnection db) =>
        db.Query<SermonManuscript>(
            """
            SELECT sermon_id AS SermonId, title AS Title, passage_start_bcv AS PassageStartBcv, passage_end_bcv AS PassageEndBcv,
                   law_text AS LawText, gospel_text AS GospelText, body_rtf AS BodyRtf, created_at AS CreatedAt, updated_at AS UpdatedAt
            FROM Sermon_Manuscripts
            ORDER BY updated_at DESC;
            """);

    public static void DeleteSermon(IDbConnection db, int sermonId) =>
        db.Execute("DELETE FROM Sermon_Manuscripts WHERE sermon_id = @sermonId;", new { sermonId });
}
