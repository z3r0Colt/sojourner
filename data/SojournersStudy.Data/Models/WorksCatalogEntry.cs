namespace SojournersStudy.Data.Models;

public sealed class WorksCatalogEntry
{
    public int WorkId { get; set; }
    public string Author { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public int? Year { get; set; }
    public bool IsPublicDomain { get; set; } = true;
}
