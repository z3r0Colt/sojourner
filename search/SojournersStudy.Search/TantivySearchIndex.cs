using System.Text.Json;

namespace SojournersStudy.Search;

/// <summary>
/// Safe, disposable wrapper around the native Tantivy index handle. Owns the
/// handle's lifetime and all string/memory marshaling so nothing above this
/// class needs `unsafe` or to know the native ABI exists.
/// </summary>
public sealed class TantivySearchIndex : IDisposable
{
    private IntPtr _handle;

    private TantivySearchIndex(IntPtr handle)
    {
        _handle = handle;
    }

    /// <summary>Opens (or creates, if absent) an index at the given directory path.</summary>
    /// <exception cref="InvalidOperationException">The native library failed to open/create the index (bad path, or a schema mismatch against an existing index there).</exception>
    public static TantivySearchIndex OpenOrCreate(string path)
    {
        Directory.CreateDirectory(path);
        IntPtr handle = NativeMethods.sojourners_search_open(path);
        if (handle == IntPtr.Zero)
        {
            throw new InvalidOperationException($"Failed to open or create the search index at '{path}'.");
        }

        return new TantivySearchIndex(handle);
    }

    public unsafe void AddDocument(ulong blockId, string author, string textBody, IReadOnlyList<ulong>? linkedBcvs = null)
    {
        ThrowIfDisposed();
        linkedBcvs ??= [];
        ulong[] bcvArray = [.. linkedBcvs];
        int result;
        fixed (ulong* bcvPtr = bcvArray)
        {
            result = NativeMethods.sojourners_search_add_document(_handle, blockId, author, textBody, bcvPtr, (nuint)bcvArray.Length);
        }

        if (result != 0)
        {
            throw new InvalidOperationException($"Failed to add document {blockId} to the search index (native error code {result}).");
        }
    }

    /// <summary>Flushes queued documents and makes them searchable immediately (synchronous -- see the native crate's own comment on why Manual reload was chosen over an async policy).</summary>
    public void Commit()
    {
        ThrowIfDisposed();
        int result = NativeMethods.sojourners_search_commit(_handle);
        if (result != 0)
        {
            throw new InvalidOperationException($"Failed to commit the search index (native error code {result}).");
        }
    }

    /// <summary>Supports standard boolean/phrase query syntax, plus a `word1 NEAR(n) word2` proximity operator (see the native crate for exactly what's supported).</summary>
    public IReadOnlyList<SearchHit> Search(string query, uint limit = 20)
    {
        ThrowIfDisposed();
        IntPtr resultPtr = NativeMethods.sojourners_search_query(_handle, query, limit);
        if (resultPtr == IntPtr.Zero)
        {
            throw new InvalidOperationException($"Search query failed to execute: '{query}'.");
        }

        try
        {
            string json = System.Runtime.InteropServices.Marshal.PtrToStringUTF8(resultPtr) ?? "[]";
            return JsonSerializer.Deserialize<List<SearchHit>>(json) ?? [];
        }
        finally
        {
            NativeMethods.sojourners_search_free_string(resultPtr);
        }
    }

    private void ThrowIfDisposed()
    {
        if (_handle == IntPtr.Zero)
        {
            throw new ObjectDisposedException(nameof(TantivySearchIndex));
        }
    }

    public void Dispose()
    {
        if (_handle != IntPtr.Zero)
        {
            NativeMethods.sojourners_search_close(_handle);
            _handle = IntPtr.Zero;
        }
    }
}
