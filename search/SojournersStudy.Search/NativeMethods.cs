using System.Runtime.InteropServices;

namespace SojournersStudy.Search;

/// <summary>
/// Direct 1:1 mapping of sojourners_search's C-ABI exports. Strings are
/// marshalled as UTF-8 (StringMarshalling.Utf8), not the platform default --
/// this app's whole reason for existing means Greek/Hebrew text crosses this
/// boundary too, and the Windows default (ANSI) would silently mangle it.
/// Callers should go through <see cref="TantivySearchIndex"/> rather than
/// these directly; it owns the handle lifetime and string marshalling
/// safely.
/// </summary>
internal static partial class NativeMethods
{
    private const string DllName = "sojourners_search";

    [LibraryImport(DllName, StringMarshalling = StringMarshalling.Utf8)]
    internal static partial IntPtr sojourners_search_open(string path);

    [LibraryImport(DllName)]
    internal static partial void sojourners_search_close(IntPtr handle);

    [LibraryImport(DllName, StringMarshalling = StringMarshalling.Utf8)]
    internal static unsafe partial int sojourners_search_add_document(
        IntPtr handle,
        ulong blockId,
        string author,
        string textBody,
        ulong* linkedBcvs,
        nuint linkedBcvsLen);

    [LibraryImport(DllName)]
    internal static partial int sojourners_search_commit(IntPtr handle);

    [LibraryImport(DllName, StringMarshalling = StringMarshalling.Utf8)]
    internal static partial IntPtr sojourners_search_query(IntPtr handle, string query, uint limit);

    [LibraryImport(DllName)]
    internal static partial void sojourners_search_free_string(IntPtr ptr);
}
