namespace SojournersStudy.Data.Models;

public sealed class SermonManuscript
{
    public int SermonId { get; set; }
    public string Title { get; set; } = string.Empty;
    public int? PassageStartBcv { get; set; }
    public int? PassageEndBcv { get; set; }
    public string? LawText { get; set; }
    public string? GospelText { get; set; }
    public string BodyRtf { get; set; } = string.Empty;
    public string CreatedAt { get; set; } = string.Empty;
    public string UpdatedAt { get; set; } = string.Empty;
}
