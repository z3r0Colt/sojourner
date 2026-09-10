namespace SojournersStudy.Data.Models;

/// <summary>
/// One paragraph/section of a theological work, scoped to the passage range
/// it comments on. BlockId is a plain SQLite rowid (not WITHOUT ROWID) so it
/// can double as the stable u64 document id the Tantivy search index refers
/// back to.
/// </summary>
public sealed class WorkContentBlock
{
    public int BlockId { get; set; }
    public int WorkId { get; set; }
    public int StartBcv { get; set; }
    public int EndBcv { get; set; }
    public string BodyText { get; set; } = string.Empty;
    public int SortOrder { get; set; }
}
