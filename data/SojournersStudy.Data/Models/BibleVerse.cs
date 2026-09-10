namespace SojournersStudy.Data.Models;

public sealed class BibleVerse
{
    public int BcvId { get; set; }
    public int TranslationId { get; set; }
    public string VerseText { get; set; } = string.Empty;
}
