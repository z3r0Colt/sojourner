using System.Data;
using Dapper;
using SojournersStudy.Data.Models;

namespace SojournersStudy.Data.Repositories;

public static class ConfessionsRepository
{
    public static int InsertDocument(IDbConnection db, ConfessionalDocument document)
    {
        const string sql = """
            INSERT INTO Confessional_Documents (code, title)
            VALUES (@Code, @Title)
            RETURNING document_id;
            """;
        return db.ExecuteScalar<int>(sql, document);
    }

    public static IEnumerable<ConfessionalDocument> GetDocuments(IDbConnection db) =>
        db.Query<ConfessionalDocument>(
            "SELECT document_id AS DocumentId, code AS Code, title AS Title FROM Confessional_Documents ORDER BY title;");

    public static void InsertProofText(IDbConnection db, ConfessionalProofText proofText)
    {
        const string sql = """
            INSERT INTO Confessional_Proof_Texts (bcv_id, document_id, chapter_num, article_num)
            VALUES (@BcvId, @DocumentId, @ChapterNum, @ArticleNum)
            ON CONFLICT (bcv_id, document_id, chapter_num, article_num) DO NOTHING;
            """;
        db.Execute(sql, proofText);
    }

    /// Every confessional citation of the given verse, across all documents -- what a
    /// "linking scripture to confessions" panel in the UI needs to render.
    public static IEnumerable<ConfessionalProofText> GetProofTextsForVerse(IDbConnection db, int bcvId) =>
        db.Query<ConfessionalProofText>(
            """
            SELECT id AS Id, bcv_id AS BcvId, document_id AS DocumentId, chapter_num AS ChapterNum, article_num AS ArticleNum
            FROM Confessional_Proof_Texts
            WHERE bcv_id = @bcvId
            ORDER BY document_id, chapter_num, article_num;
            """,
            new { bcvId });
}
