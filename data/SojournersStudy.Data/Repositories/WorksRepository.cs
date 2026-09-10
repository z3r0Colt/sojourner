using System.Data;
using Dapper;
using SojournersStudy.Data.Models;

namespace SojournersStudy.Data.Repositories;

public static class WorksRepository
{
    public static int InsertWork(IDbConnection db, WorksCatalogEntry work)
    {
        const string sql = """
            INSERT INTO Works_Catalog (author, title, year, is_public_domain)
            VALUES (@Author, @Title, @Year, @IsPublicDomain)
            RETURNING work_id;
            """;
        return db.ExecuteScalar<int>(sql, work);
    }

    public static IEnumerable<WorksCatalogEntry> GetWorks(IDbConnection db) =>
        db.Query<WorksCatalogEntry>(
            """
            SELECT work_id AS WorkId, author AS Author, title AS Title, year AS Year, is_public_domain AS IsPublicDomain
            FROM Works_Catalog
            ORDER BY author, title;
            """);

    public static int InsertContentBlock(IDbConnection db, WorkContentBlock block)
    {
        const string sql = """
            INSERT INTO Work_Content_Blocks (work_id, start_bcv, end_bcv, body_text, sort_order)
            VALUES (@WorkId, @StartBcv, @EndBcv, @BodyText, @SortOrder)
            RETURNING block_id;
            """;
        return db.ExecuteScalar<int>(sql, block);
    }

    /// Blocks whose range overlaps the given verse at all (start_bcv &lt;= bcvId &lt;= end_bcv),
    /// covering both single-verse blocks and blocks spanning several verses.
    public static IEnumerable<WorkContentBlock> GetBlocksForVerse(IDbConnection db, int bcvId) =>
        db.Query<WorkContentBlock>(
            """
            SELECT block_id AS BlockId, work_id AS WorkId, start_bcv AS StartBcv, end_bcv AS EndBcv,
                   body_text AS BodyText, sort_order AS SortOrder
            FROM Work_Content_Blocks
            WHERE start_bcv <= @bcvId AND end_bcv >= @bcvId
            ORDER BY work_id, sort_order;
            """,
            new { bcvId });
}
