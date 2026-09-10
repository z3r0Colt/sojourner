namespace SojournersStudy.Data;

public sealed record BibleBook(int Number, string Name, string Abbreviation, bool IsNewTestament);

/// <summary>Standard 66-book Protestant canon order/numbering that every bcv_id's book digit refers to.</summary>
public static class BibleBooks
{
    public static readonly IReadOnlyList<BibleBook> All = new List<BibleBook>
    {
        new(1, "Genesis", "Gen", false),
        new(2, "Exodus", "Exod", false),
        new(3, "Leviticus", "Lev", false),
        new(4, "Numbers", "Num", false),
        new(5, "Deuteronomy", "Deut", false),
        new(6, "Joshua", "Josh", false),
        new(7, "Judges", "Judg", false),
        new(8, "Ruth", "Ruth", false),
        new(9, "1 Samuel", "1Sam", false),
        new(10, "2 Samuel", "2Sam", false),
        new(11, "1 Kings", "1Kgs", false),
        new(12, "2 Kings", "2Kgs", false),
        new(13, "1 Chronicles", "1Chr", false),
        new(14, "2 Chronicles", "2Chr", false),
        new(15, "Ezra", "Ezra", false),
        new(16, "Nehemiah", "Neh", false),
        new(17, "Esther", "Esth", false),
        new(18, "Job", "Job", false),
        new(19, "Psalms", "Ps", false),
        new(20, "Proverbs", "Prov", false),
        new(21, "Ecclesiastes", "Eccl", false),
        new(22, "Song of Solomon", "Song", false),
        new(23, "Isaiah", "Isa", false),
        new(24, "Jeremiah", "Jer", false),
        new(25, "Lamentations", "Lam", false),
        new(26, "Ezekiel", "Ezek", false),
        new(27, "Daniel", "Dan", false),
        new(28, "Hosea", "Hos", false),
        new(29, "Joel", "Joel", false),
        new(30, "Amos", "Amos", false),
        new(31, "Obadiah", "Obad", false),
        new(32, "Jonah", "Jonah", false),
        new(33, "Micah", "Mic", false),
        new(34, "Nahum", "Nah", false),
        new(35, "Habakkuk", "Hab", false),
        new(36, "Zephaniah", "Zeph", false),
        new(37, "Haggai", "Hag", false),
        new(38, "Zechariah", "Zech", false),
        new(39, "Malachi", "Mal", false),
        new(40, "Matthew", "Matt", true),
        new(41, "Mark", "Mark", true),
        new(42, "Luke", "Luke", true),
        new(43, "John", "John", true),
        new(44, "Acts", "Acts", true),
        new(45, "Romans", "Rom", true),
        new(46, "1 Corinthians", "1Cor", true),
        new(47, "2 Corinthians", "2Cor", true),
        new(48, "Galatians", "Gal", true),
        new(49, "Ephesians", "Eph", true),
        new(50, "Philippians", "Phil", true),
        new(51, "Colossians", "Col", true),
        new(52, "1 Thessalonians", "1Thess", true),
        new(53, "2 Thessalonians", "2Thess", true),
        new(54, "1 Timothy", "1Tim", true),
        new(55, "2 Timothy", "2Tim", true),
        new(56, "Titus", "Titus", true),
        new(57, "Philemon", "Phlm", true),
        new(58, "Hebrews", "Heb", true),
        new(59, "James", "Jas", true),
        new(60, "1 Peter", "1Pet", true),
        new(61, "2 Peter", "2Pet", true),
        new(62, "1 John", "1John", true),
        new(63, "2 John", "2John", true),
        new(64, "3 John", "3John", true),
        new(65, "Jude", "Jude", true),
        new(66, "Revelation", "Rev", true),
    };

    private static readonly Dictionary<int, BibleBook> ByNumber = All.ToDictionary(b => b.Number);

    public static BibleBook Get(int number) =>
        ByNumber.TryGetValue(number, out BibleBook? book)
            ? book
            : throw new ArgumentOutOfRangeException(nameof(number), number, "Book number must be between 1 and 66.");
}
