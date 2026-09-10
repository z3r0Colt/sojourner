using Dapper;
using SojournersStudy.Data;
using SojournersStudy.Data.Database;
using SojournersStudy.Importer;

string repoRoot = FindRepoRoot(AppContext.BaseDirectory);
Console.WriteLine($"Repo root: {repoRoot}");

var db = SojournersDatabase.CreateDefault();
Console.WriteLine($"Database:  {db.DataSource}");

using (var conn = db.OpenConnection())
{
    // One transaction for the whole run rather than one auto-commit per
    // row -- SQLite fsyncs on every implicit commit, which turns 31,000+
    // individual verse inserts into a multi-minute operation instead of a
    // few seconds.
    conn.Execute("BEGIN;");

    Console.WriteLine();
    Console.WriteLine("== Bible text (KJV) ==");
    string kjvPath = Path.Combine(repoRoot, "bibles", "King James Version (1769).xml");
    int verseCount = BibleImporter.Import(conn, kjvPath, code: "KJV", displayName: "King James Version", year: 1769);
    Console.WriteLine($"  Imported {verseCount} verses.");

    int MaxVerseForChapter(int book, int chapter) =>
        conn.QuerySingle<int>(
            "SELECT MAX(bcv_id) % 1000 FROM Bible_Verses b JOIN Bible_Translations t ON b.translation_id = t.translation_id " +
            "WHERE t.code = 'KJV' AND bcv_id BETWEEN @start AND @end",
            new { start = BcvReference.ChapterStart(book, chapter), end = BcvReference.ChapterEnd(book, chapter) });

    Console.WriteLine();
    Console.WriteLine("== Westminster Standards ==");
    string westminsterDir = Path.Combine(repoRoot, "reference", "westminster");

    (int sections, int proofTexts) = WestminsterImporter.ImportConfession(conn, Path.Combine(westminsterDir, "confession.json"), MaxVerseForChapter);
    Console.WriteLine($"  Confession: {sections} sections, {proofTexts} distinct verse citations.");

    (sections, proofTexts) = WestminsterImporter.ImportLargerCatechism(conn, Path.Combine(westminsterDir, "larger_catechism.json"), MaxVerseForChapter);
    Console.WriteLine($"  Larger Catechism: {sections} questions, {proofTexts} distinct verse citations.");

    (sections, _) = WestminsterImporter.ImportShorterCatechism(conn, Path.Combine(westminsterDir, "shorter_catechism.json"));
    Console.WriteLine($"  Shorter Catechism: {sections} questions (no proof texts in source).");

    Console.WriteLine();
    Console.WriteLine("== Three Forms of Unity (text only -- source has no proof texts) ==");
    string confessionsDir = Path.Combine(repoRoot, "reference", "confessions");

    int count = ThreeFormsImporter.ImportHeidelbergCatechism(conn, Path.Combine(confessionsDir, "heidelberg.json"));
    Console.WriteLine($"  Heidelberg Catechism: {count} questions.");

    count = ThreeFormsImporter.ImportBelgicConfession(conn, Path.Combine(confessionsDir, "belgic.json"));
    Console.WriteLine($"  Belgic Confession: {count} sections.");

    count = ThreeFormsImporter.ImportCanonsOfDort(conn, Path.Combine(confessionsDir, "canons_of_dort.json"));
    Console.WriteLine($"  Canons of Dort: {count} sections.");

    conn.Execute("COMMIT;");
}

Console.WriteLine();
Console.WriteLine("Done.");

static string FindRepoRoot(string startDir)
{
    var dir = new DirectoryInfo(startDir);
    while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "SojournersStudy.sln")))
    {
        dir = dir.Parent;
    }

    return dir?.FullName ?? throw new DirectoryNotFoundException("Could not find repo root (no SojournersStudy.sln found in any parent directory).");
}
