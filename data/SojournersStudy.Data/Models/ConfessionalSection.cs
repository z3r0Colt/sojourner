namespace SojournersStudy.Data.Models;

/// <summary>The confession's own text (see Schema.cs's comment on why this exists separately from Confessional_Proof_Texts).</summary>
public sealed class ConfessionalSection
{
    public int Id { get; set; }
    public int DocumentId { get; set; }
    public int? ChapterNum { get; set; }
    public int? ArticleNum { get; set; }
    public string? Heading { get; set; }
    public string ContentText { get; set; } = string.Empty;
    public int SortOrder { get; set; }
}
