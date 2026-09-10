namespace SojournersStudy.Models;

/// A single tab in a study workspace TabView -- e.g. an open Bible chapter, a
/// lexicon entry, or a commentary excerpt. Kept as a plain data item (rather
/// than a TabViewItem directly) so TabView's tear-out machinery can move it
/// between windows' backing collections without touching any live UI element.
public sealed class StudyTabItem
{
    public string Header { get; set; } = string.Empty;

    public string IconGlyph { get; set; } = string.Empty;

    public string BodyText { get; set; } = string.Empty;
}
