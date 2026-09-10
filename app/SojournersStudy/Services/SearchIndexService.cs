using SojournersStudy.Data.Database;
using SojournersStudy.Data.Repositories;
using SojournersStudy.Search;

namespace SojournersStudy.Services;

/// <summary>
/// Owns the one Tantivy index for the app lifetime and keeps it populated
/// from Work_Content_Blocks. The native index has no delete/upsert in its
/// current C-ABI surface (see sojourners_search's own comment: it's a first
/// pass), so re-adding the same rows on every launch would just duplicate
/// documents forever -- a marker file records that the initial index build
/// already ran, rather than re-indexing every time.
/// </summary>
public static class SearchIndexService
{
    private static readonly string IndexPath =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SojournersStudy", "search_index");

    private static readonly string MarkerPath = Path.Combine(IndexPath, ".indexed");

    private static TantivySearchIndex? _index;

    public static TantivySearchIndex GetOrOpen()
    {
        _index ??= TantivySearchIndex.OpenOrCreate(IndexPath);
        return _index;
    }

    public static void EnsureIndexed()
    {
        if (File.Exists(MarkerPath))
        {
            return;
        }

        TantivySearchIndex index = GetOrOpen();
        var db = SojournersDatabase.CreateDefault();
        using var conn = db.OpenConnection();

        Dictionary<int, string> authorsByWorkId = WorksRepository.GetWorks(conn).ToDictionary(w => w.WorkId, w => w.Author);
        foreach (var block in WorksRepository.GetAllBlocks(conn))
        {
            string author = authorsByWorkId.GetValueOrDefault(block.WorkId, "Unknown");
            index.AddDocument((ulong)block.BlockId, author, block.BodyText, [(ulong)block.StartBcv, (ulong)block.EndBcv]);
        }

        index.Commit();
        Directory.CreateDirectory(IndexPath);
        File.WriteAllText(MarkerPath, DateTimeOffset.UtcNow.ToString("O"));
    }
}
