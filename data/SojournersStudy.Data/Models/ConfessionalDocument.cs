namespace SojournersStudy.Data.Models;

/// <summary>One confessional standard, e.g. the Westminster Confession or the Heidelberg Catechism.</summary>
public sealed class ConfessionalDocument
{
    public int DocumentId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
}
