namespace SojournersStudy.Data.Models;

/// <summary>Maps a verse to a place in a confessional document that cites it as a proof text.</summary>
public sealed class ConfessionalProofText
{
    public int Id { get; set; }
    public int BcvId { get; set; }
    public int DocumentId { get; set; }
    public int ChapterNum { get; set; }
    public int? ArticleNum { get; set; }
}
