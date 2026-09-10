namespace SojournersStudy.Data;

/// <summary>
/// Encodes/decodes the BBCCCVVV integer scheme used everywhere in this app in
/// place of string references: 2 digits book number (1-66, standard
/// Protestant canon order), 3 digits chapter, 3 digits verse. E.g. Romans
/// 8:28 -> book 45, chapter 008, verse 028 -> 45008028. Verse 0 within a
/// chapter (chapter_num-only, no article_num) is used by callers that need a
/// whole-chapter reference (e.g. a confessional proof text citing "Genesis
/// 1" generally); this type does not special-case it.
/// </summary>
public static class BcvReference
{
    public const int MaxChapter = 999;
    public const int MaxVerse = 999;

    public static int Encode(int book, int chapter, int verse)
    {
        if (book is < 1 or > 66)
        {
            throw new ArgumentOutOfRangeException(nameof(book), book, "Book number must be between 1 and 66.");
        }

        if (chapter is < 0 or > MaxChapter)
        {
            throw new ArgumentOutOfRangeException(nameof(chapter), chapter, $"Chapter must be between 0 and {MaxChapter}.");
        }

        if (verse is < 0 or > MaxVerse)
        {
            throw new ArgumentOutOfRangeException(nameof(verse), verse, $"Verse must be between 0 and {MaxVerse}.");
        }

        return (book * 1_000_000) + (chapter * 1_000) + verse;
    }

    public static (int Book, int Chapter, int Verse) Decode(int bcv)
    {
        if (bcv is < 1_000_000 or > 66_999_999)
        {
            throw new ArgumentOutOfRangeException(nameof(bcv), bcv, "Value is not a valid BCV reference.");
        }

        int book = bcv / 1_000_000;
        int chapter = (bcv / 1_000) % 1_000;
        int verse = bcv % 1_000;
        return (book, chapter, verse);
    }

    /// Smallest bcv_id that could belong to the given chapter (verse 0), for
    /// range-scanning a whole chapter with a single `BETWEEN`.
    public static int ChapterStart(int book, int chapter) => Encode(book, chapter, 0);

    /// Largest bcv_id that could belong to the given chapter, for the same
    /// range-scan use as <see cref="ChapterStart"/>.
    public static int ChapterEnd(int book, int chapter) => Encode(book, chapter, MaxVerse);
}
