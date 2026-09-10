namespace SojournersStudy.Pages;

/// <summary>One Tantivy search hit, shaped for AutoSuggestBox's default ToString() display.</summary>
public sealed class SearchResultItem
{
    public required string Author { get; init; }
    public required string Snippet { get; init; }
    public required int Book { get; init; }
    public required int Chapter { get; init; }

    public override string ToString() => $"{Author} — {Snippet}";
}
