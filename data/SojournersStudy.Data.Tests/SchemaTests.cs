using Microsoft.Data.Sqlite;
using SojournersStudy.Data.Database;
using SojournersStudy.Data.Models;
using SojournersStudy.Data.Repositories;
using Xunit;

namespace SojournersStudy.Data.Tests;

/// <summary>
/// Exercises the real schema against a real (temp-file) SQLite database via
/// Dapper -- not mocks -- so WITHOUT ROWID composite keys, foreign keys,
/// RETURNING, and ON CONFLICT upserts are all verified against actual SQLite
/// behavior rather than assumed from the DDL text.
/// </summary>
public sealed class SchemaTests : IDisposable
{
    private readonly string _path;
    private readonly SojournersDatabase _db;

    public SchemaTests()
    {
        _path = Path.Combine(Path.GetTempPath(), $"sojourners-test-{Guid.NewGuid():N}.db");
        _db = new SojournersDatabase(_path);
    }

    public void Dispose()
    {
        // Microsoft.Data.Sqlite pools native connections per file by default
        // (a production-worthwhile default, so it isn't disabled on
        // SojournersDatabase itself) -- the pool keeps the file handle open
        // past a connection's own Dispose(), which would otherwise make this
        // cleanup step fail with a sharing violation.
        SqliteConnection.ClearAllPools();
        if (File.Exists(_path))
        {
            File.Delete(_path);
        }
    }

    [Fact]
    public void Opening_the_database_twice_is_idempotent()
    {
        using var first = _db.OpenConnection();
        using var second = _db.OpenConnection();
        // No exception from re-running CREATE TABLE IF NOT EXISTS is the assertion.
    }

    [Fact]
    public void Bible_verse_round_trips_through_the_without_rowid_composite_key()
    {
        using var conn = _db.OpenConnection();
        int translationId = BibleRepository.InsertTranslation(conn, new BibleTranslation
        {
            Code = "KJV",
            DisplayName = "King James Version",
            Year = 1769,
        });

        int bcv = BcvReference.Encode(1, 1, 1);
        BibleRepository.UpsertVerse(conn, new BibleVerse
        {
            BcvId = bcv,
            TranslationId = translationId,
            VerseText = "In the beginning God created the heaven and the earth.",
        });

        BibleVerse? fetched = BibleRepository.GetVerse(conn, bcv, translationId);
        Assert.NotNull(fetched);
        Assert.Equal("In the beginning God created the heaven and the earth.", fetched!.VerseText);

        // Upsert with the same composite key updates in place rather than duplicating.
        BibleRepository.UpsertVerse(conn, new BibleVerse
        {
            BcvId = bcv,
            TranslationId = translationId,
            VerseText = "Updated text.",
        });
        Assert.Equal("Updated text.", BibleRepository.GetVerse(conn, bcv, translationId)!.VerseText);
    }

    [Fact]
    public void Chapter_range_query_returns_only_that_chapters_verses_in_order()
    {
        using var conn = _db.OpenConnection();
        int translationId = BibleRepository.InsertTranslation(conn, new BibleTranslation { Code = "KJV", DisplayName = "King James Version" });

        // Genesis 1:3, 1:1, 1:2 inserted out of order, plus a Genesis 2:1 decoy.
        foreach (int verse in new[] { 3, 1, 2 })
        {
            BibleRepository.UpsertVerse(conn, new BibleVerse
            {
                BcvId = BcvReference.Encode(1, 1, verse),
                TranslationId = translationId,
                VerseText = $"Genesis 1:{verse}",
            });
        }
        BibleRepository.UpsertVerse(conn, new BibleVerse
        {
            BcvId = BcvReference.Encode(1, 2, 1),
            TranslationId = translationId,
            VerseText = "Genesis 2:1 (should not appear)",
        });

        List<BibleVerse> chapter1 = BibleRepository.GetChapterVerses(conn, 1, 1, translationId).ToList();

        Assert.Equal(3, chapter1.Count);
        Assert.Equal(["Genesis 1:1", "Genesis 1:2", "Genesis 1:3"], chapter1.Select(v => v.VerseText));
    }

    [Fact]
    public void Original_text_words_for_a_verse_come_back_in_word_order()
    {
        using var conn = _db.OpenConnection();
        int bcv = BcvReference.Encode(45, 1, 8);

        OriginalTextRepository.UpsertWord(conn, new OriginalTextWord { BcvId = bcv, WordOrder = 1, SurfaceWord = "ἀλλὰ", StrongsNumber = "G235" });
        OriginalTextRepository.UpsertWord(conn, new OriginalTextWord { BcvId = bcv, WordOrder = 0, SurfaceWord = "λήμψεσθε", StrongsNumber = "G2983" });

        List<OriginalTextWord> words = OriginalTextRepository.GetWordsForVerse(conn, bcv).ToList();

        Assert.Equal(2, words.Count);
        Assert.Equal("λήμψεσθε", words[0].SurfaceWord);
        Assert.Equal("ἀλλὰ", words[1].SurfaceWord);
    }

    [Fact]
    public void Work_content_block_range_lookup_finds_a_block_spanning_multiple_verses()
    {
        using var conn = _db.OpenConnection();
        int workId = WorksRepository.InsertWork(conn, new WorksCatalogEntry { Author = "John Calvin", Title = "Commentary on Romans" });
        int blockId = WorksRepository.InsertContentBlock(conn, new WorkContentBlock
        {
            WorkId = workId,
            StartBcv = BcvReference.Encode(45, 8, 28),
            EndBcv = BcvReference.Encode(45, 8, 30),
            BodyText = "We know that all things work together for good...",
            SortOrder = 0,
        });

        // A verse in the middle of the block's range, not just its exact start/end.
        int middleVerse = BcvReference.Encode(45, 8, 29);
        List<WorkContentBlock> blocks = WorksRepository.GetBlocksForVerse(conn, middleVerse).ToList();

        Assert.Single(blocks);
        Assert.Equal(blockId, blocks[0].BlockId);
    }

    [Fact]
    public void Confessional_proof_text_links_a_verse_to_a_document_and_is_deduplicated_on_reinsert()
    {
        using var conn = _db.OpenConnection();
        int docId = ConfessionsRepository.InsertDocument(conn, new ConfessionalDocument { Code = "WCF", Title = "Westminster Confession of Faith" });

        int bcv = BcvReference.Encode(45, 8, 28);
        var proofText = new ConfessionalProofText { BcvId = bcv, DocumentId = docId, ChapterNum = 3, ArticleNum = 1 };
        ConfessionsRepository.InsertProofText(conn, proofText);
        ConfessionsRepository.InsertProofText(conn, proofText); // duplicate insert should be a no-op

        List<ConfessionalProofText> results = ConfessionsRepository.GetProofTextsForVerse(conn, bcv).ToList();

        Assert.Single(results);
        Assert.Equal(docId, results[0].DocumentId);
        Assert.Equal(3, results[0].ChapterNum);
        Assert.Equal(1, results[0].ArticleNum);
    }
}
