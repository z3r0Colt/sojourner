namespace SojournersStudy.Data.Models;

public sealed class BibleTranslation
{
    public int TranslationId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public int? Year { get; set; }
    public bool IsPublicDomain { get; set; } = true;
}
