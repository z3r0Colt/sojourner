namespace SojournersStudy.Data.Models;

/// <summary>A Strong's Dictionary entry (see Schema.cs's comment on why this stands in for the architecture doc's Thayer's/BDB ask).</summary>
public sealed class LexiconEntry
{
    public string StrongsId { get; set; } = string.Empty;
    public string OriginalWord { get; set; } = string.Empty;
    public string? Transliteration { get; set; }
    public string? Pronunciation { get; set; }
    public string Definition { get; set; } = string.Empty;
    public string? KjvUsage { get; set; }
}
