namespace SojournersStudy.Data.Models;

public sealed class OriginalTextWord
{
    public int BcvId { get; set; }
    public int WordOrder { get; set; }
    public string SurfaceWord { get; set; } = string.Empty;
    public string? Lemma { get; set; }
    public string? StrongsNumber { get; set; }
    public string? MorphCode { get; set; }
    public string? Gloss { get; set; }
}
