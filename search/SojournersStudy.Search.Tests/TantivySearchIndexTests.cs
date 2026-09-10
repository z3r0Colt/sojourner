using SojournersStudy.Search;
using Xunit;

namespace SojournersStudy.Search.Tests;

/// <summary>
/// Exercises the real compiled Rust DLL through the real P/Invoke bridge --
/// not a mock of either side -- so a broken FFI signature, a marshaling
/// mismatch, or a native-side bug all surface here rather than only at
/// runtime inside the WinUI app.
/// </summary>
public sealed class TantivySearchIndexTests : IDisposable
{
    private readonly string _path;

    public TantivySearchIndexTests()
    {
        _path = Path.Combine(Path.GetTempPath(), $"sojourners-search-test-{Guid.NewGuid():N}");
    }

    public void Dispose()
    {
        if (Directory.Exists(_path))
        {
            Directory.Delete(_path, recursive: true);
        }
    }

    [Fact]
    public void Finds_a_document_by_a_plain_term_query()
    {
        using var index = TantivySearchIndex.OpenOrCreate(_path);
        index.AddDocument(1, "John Calvin", "grace abounds through covenant faithfulness", [45008028]);
        index.AddDocument(2, "John Owen", "the mortification of sin in believers", [45008013]);
        index.Commit();

        IReadOnlyList<SearchHit> hits = index.Search("covenant");

        Assert.Single(hits);
        Assert.Equal(1u, hits[0].BlockId);
        Assert.Equal("John Calvin", hits[0].Author);
        Assert.Equal([45008028UL], hits[0].LinkedBcvs);
    }

    [Fact]
    public void Supports_a_near_proximity_query()
    {
        using var index = TantivySearchIndex.OpenOrCreate(_path);
        index.AddDocument(1, "A", "grace flows from the covenant");
        index.AddDocument(2, "A", "grace is one thing and here is quite another distinct covenant");
        index.Commit();

        IReadOnlyList<SearchHit> hits = index.Search("grace NEAR(3) covenant");

        Assert.Single(hits);
        Assert.Equal(1u, hits[0].BlockId);
    }

    [Fact]
    public void Handles_greek_text_correctly_across_the_ffi_boundary()
    {
        // The whole point of UTF-8 marshaling: this app's real content includes
        // Greek/Hebrew, which the platform-default (ANSI) marshaling would mangle.
        using var index = TantivySearchIndex.OpenOrCreate(_path);
        index.AddDocument(1, "John", "Ἐν ἀρχῇ ἦν ὁ λόγος καὶ ὁ λόγος ἦν πρὸς τὸν θεόν");
        index.Commit();

        IReadOnlyList<SearchHit> hits = index.Search("λόγος");

        Assert.Single(hits);
        Assert.Contains("λόγος", hits[0].TextBody);
    }

    [Fact]
    public void Reopening_an_existing_index_preserves_committed_documents()
    {
        using (var index = TantivySearchIndex.OpenOrCreate(_path))
        {
            index.AddDocument(1, "A", "persisted_marker_text");
            index.Commit();
        }

        using var reopened = TantivySearchIndex.OpenOrCreate(_path);
        IReadOnlyList<SearchHit> hits = reopened.Search("persisted_marker_text");

        Assert.Single(hits);
    }

    [Fact]
    public void Disposed_index_throws_on_further_use()
    {
        var index = TantivySearchIndex.OpenOrCreate(_path);
        index.Dispose();

        Assert.Throws<ObjectDisposedException>(() => index.Search("anything"));
    }
}
