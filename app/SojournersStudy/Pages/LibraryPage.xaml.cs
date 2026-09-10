using System.Collections.ObjectModel;
using Microsoft.UI.Xaml.Controls;
using SojournersStudy.Models;
using SojournersStudy.Services;

namespace SojournersStudy.Pages;

/// <summary>
/// The main study workspace: a tear-out-capable TabView holding whatever a
/// pastor currently has open (Bible chapters, lexicon entries, commentary
/// excerpts). Placeholder tabs/content here will be replaced once the SQLite
/// data tier (Phase 2) and interlinear view (Phase 3) exist.
/// </summary>
public sealed partial class LibraryPage : Page
{
    public ObservableCollection<StudyTabItem> Items { get; } = new()
    {
        new StudyTabItem
        {
            Header = "Genesis 1",
            IconGlyph = "",
            BodyText = "In the beginning God created the heaven and the earth...\n\n(Placeholder -- real chapter text arrives with the SQLite data tier in Phase 2.)",
        },
    };

    public TabView TabViewControl => StudyTabView;

    public LibraryPage()
    {
        InitializeComponent();
    }

    private void StudyTabView_AddTabButtonClick(TabView sender, object args)
    {
        Items.Add(new StudyTabItem
        {
            Header = "New Tab",
            IconGlyph = "",
            BodyText = "Open a passage, lexicon entry, or commentary to begin.",
        });
    }

    private void StudyTabView_TabTearOutWindowRequested(TabView sender, TabViewTabTearOutWindowRequestedEventArgs args)
        => TabTearOutCoordinator.HandleTearOutWindowRequested(sender, args);

    private void StudyTabView_TabTearOutRequested(TabView sender, TabViewTabTearOutRequestedEventArgs args)
        => TabTearOutCoordinator.HandleTearOutRequested(args, Items);
}
