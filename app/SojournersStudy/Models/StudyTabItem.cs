using System.Collections.ObjectModel;
using SojournersStudy.Data.Models;

namespace SojournersStudy.Models;

public enum TabContentKind
{
    PlainText,
    Interlinear,
}

/// A single tab in a study workspace TabView -- e.g. an open Bible chapter, a
/// lexicon entry, or a commentary excerpt. Kept as a plain data item (rather
/// than a TabViewItem directly) so TabView's tear-out machinery can move it
/// between windows' backing collections without touching any live UI element
/// -- each window rebuilds its own visual tree from this data via
/// TabContentTemplateSelector, it never moves a live control between windows.
public sealed class StudyTabItem
{
    public string Header { get; set; } = string.Empty;

    public string IconGlyph { get; set; } = string.Empty;

    public TabContentKind Kind { get; set; } = TabContentKind.PlainText;

    public string BodyText { get; set; } = string.Empty;

    public ObservableCollection<OriginalTextWord> InterlinearWords { get; set; } = new();
}
