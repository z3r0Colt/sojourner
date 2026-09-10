using System.Collections.ObjectModel;
using Microsoft.UI.Xaml.Controls;
using SojournersStudy.Data.Database;
using SojournersStudy.Models;
using SojournersStudy.Seeding;
using SojournersStudy.Services;

namespace SojournersStudy.Pages;

/// <summary>
/// The main study workspace: a tear-out-capable TabView holding whatever a
/// pastor currently has open (Bible chapters, lexicon entries, commentary
/// excerpts).
/// </summary>
public sealed partial class LibraryPage : Page
{
    public ObservableCollection<StudyTabItem> Items { get; } = new();

    public TabView TabViewControl => StudyTabView;

    public LibraryPage()
    {
        InitializeComponent();

        var db = SojournersDatabase.CreateDefault();
        var johnWords = DemoDataSeeder.EnsureJohn1_1Seeded(db);
        Items.Add(new StudyTabItem
        {
            Header = "John 1:1",
            IconGlyph = "",
            Kind = TabContentKind.Interlinear,
            InterlinearWords = new ObservableCollection<Data.Models.OriginalTextWord>(johnWords),
        });
    }

    private void StudyTabView_AddTabButtonClick(TabView sender, object args)
    {
        Items.Add(new StudyTabItem
        {
            Header = "New Tab",
            IconGlyph = "",
            BodyText = "Open a passage, lexicon entry, or commentary to begin.",
        });
    }

    private void StudyTabView_TabTearOutWindowRequested(TabView sender, TabViewTabTearOutWindowRequestedEventArgs args)
        => TabTearOutCoordinator.HandleTearOutWindowRequested(sender, args);

    private void StudyTabView_TabTearOutRequested(TabView sender, TabViewTabTearOutRequestedEventArgs args)
        => TabTearOutCoordinator.HandleTearOutRequested(args, Items);
}
