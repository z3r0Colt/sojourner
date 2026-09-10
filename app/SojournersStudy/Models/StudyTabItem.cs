using System.Collections.ObjectModel;
using SojournersStudy.Data.Models;

namespace SojournersStudy.Models;

public enum TabContentKind
{
    PlainText,
    Interlinear,
    Reading,
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

    /// Only meaningful when Kind == Reading. ReadingView queries Bible_Verses
    /// / Confessional_Proof_Texts itself from these primitives rather than
    /// the tab item carrying pre-loaded rows -- keeps this a plain,
    /// serializable-ish data item for tear-out, same reasoning as everything
    /// else on this type.
    public int ReadingBook { get; set; }

    public int ReadingChapter { get; set; }
}
