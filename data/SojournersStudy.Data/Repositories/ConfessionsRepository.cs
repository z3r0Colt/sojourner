using System.Data;
using Dapper;
using SojournersStudy.Data.Models;

namespace SojournersStudy.Data.Repositories;

public static class ConfessionsRepository
{
    /// Upsert by `code` (its natural key) rather than plain insert, so an
    /// importer can be re-run without violating the UNIQUE constraint.
    public static int UpsertDocument(IDbConnection db, ConfessionalDocument document)
    {
        const string sql = """
            INSERT INTO Confessional_Documents (code, title)
            VALUES (@Code, @Title)
            ON CONFLICT (code) DO UPDATE SET title = excluded.title
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

    public static int InsertSection(IDbConnection db, ConfessionalSection section)
    {
        const string sql = """
            INSERT INTO Confessional_Sections (document_id, chapter_num, article_num, heading, content_text, sort_order)
            VALUES (@DocumentId, @ChapterNum, @ArticleNum, @Heading, @ContentText, @SortOrder)
            RETURNING id;
            """;
        return db.ExecuteScalar<int>(sql, section);
    }

    public static IEnumerable<ConfessionalSection> GetSectionsForDocument(IDbConnection db, int documentId) =>
        db.Query<ConfessionalSection>(
            """
            SELECT id AS Id, document_id AS DocumentId, chapter_num AS ChapterNum, article_num AS ArticleNum,
                   heading AS Heading, content_text AS ContentText, sort_order AS SortOrder
            FROM Confessional_Sections
            WHERE document_id = @documentId
            ORDER BY sort_order;
            """,
            new { documentId });

    /// The section(s) a "WCF 6" style badge should open -- chapter/article
    /// number match within one document, ties broken by sort_order (a
    /// badge naming only a chapter, e.g. a whole-chapter proof text, can
    /// resolve to more than one section).
    public static IEnumerable<ConfessionalSection> GetSections(IDbConnection db, int documentId, int? chapterNum, int? articleNum) =>
        db.Query<ConfessionalSection>(
            """
            SELECT id AS Id, document_id AS DocumentId, chapter_num AS ChapterNum, article_num AS ArticleNum,
                   heading AS Heading, content_text AS ContentText, sort_order AS SortOrder
            FROM Confessional_Sections
            WHERE document_id = @documentId
              AND chapter_num IS @chapterNum
              AND (@articleNum IS NULL OR article_num IS @articleNum)
            ORDER BY sort_order;
            """,
            new { documentId, chapterNum, articleNum });

    public static void DeleteSectionsForDocument(IDbConnection db, int documentId) =>
        db.Execute("DELETE FROM Confessional_Sections WHERE document_id = @documentId;", new { documentId });
}
