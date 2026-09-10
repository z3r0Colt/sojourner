using SojournersStudy.Data;

namespace SojournersStudy.Importer;

/// <summary>
/// Parses the Westminster Standards' proof-text reference format, e.g.
/// "Gen.1.1", "Ps.19.1-Ps.19.3" (verse range), "Deut.20" (whole chapter),
/// "Heb.8-Heb.10" (chapter range), and comma-joined combinations of any of
/// these ("Acts.2.42,Acts.2.46-Acts.2.47") -- all real forms found in
/// reference/westminster/*.json. A range's two sides always share the same
/// book (verified against the actual source data before writing this),
/// so that isn't handled generally.
/// </summary>
public static class ScriptureReferenceParser
{
    public static List<int> ParseToBcvList(string reference, Func<int, int, int> maxVerseForChapter)
    {
        var result = new List<int>();
        foreach (string rawSegment in reference.Split(','))
        {
            string segment = rawSegment.Trim();
            if (segment.Length == 0)
            {
                continue;
            }

            result.AddRange(ParseSegment(segment, maxVerseForChapter));
        }

        return result;
    }

    private static List<int> ParseSegment(string segment, Func<int, int, int> maxVerseForChapter)
    {
        if (!segment.Contains('-'))
        {
            return ExpandPoint(ParseLocation(segment), maxVerseForChapter);
        }

        string[] parts = segment.Split('-', 2);
        (int Book, int Chapter, int? Verse) start = ParseLocation(parts[0]);
        (int Book, int Chapter, int? Verse) end = ParseLocation(parts[1]);

        var result = new List<int>();
        for (int chapter = start.Chapter; chapter <= end.Chapter; chapter++)
        {
            int verseStart = chapter == start.Chapter ? start.Verse ?? 1 : 1;
            int verseEnd = chapter == end.Chapter ? end.Verse ?? maxVerseForChapter(start.Book, chapter) : maxVerseForChapter(start.Book, chapter);
            for (int verse = verseStart; verse <= verseEnd; verse++)
            {
                result.Add(BcvReference.Encode(start.Book, chapter, verse));
            }
        }

        return result;
    }

    private static List<int> ExpandPoint((int Book, int Chapter, int? Verse) location, Func<int, int, int> maxVerseForChapter)
    {
        if (location.Verse is int verse)
        {
            return [BcvReference.Encode(location.Book, location.Chapter, verse)];
        }

        int max = maxVerseForChapter(location.Book, location.Chapter);
        var result = new List<int>(max);
        for (int v = 1; v <= max; v++)
        {
            result.Add(BcvReference.Encode(location.Book, location.Chapter, v));
        }

        return result;
    }

    private static (int Book, int Chapter, int? Verse) ParseLocation(string location)
    {
        string[] parts = location.Split('.');
        var book = BibleBooks.All.FirstOrDefault(b => b.Abbreviation == parts[0]);
        if (book is null)
        {
            throw new FormatException($"Unrecognized book abbreviation '{parts[0]}' in reference '{location}'.");
        }

        int chapter = int.Parse(parts[1]);
        int? verse = parts.Length > 2 ? int.Parse(parts[2]) : null;
        return (book.Number, chapter, verse);
    }
}
