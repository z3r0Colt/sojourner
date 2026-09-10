using System.Collections.ObjectModel;
using Microsoft.UI.Xaml.Controls;
using SojournersStudy.Data;
using SojournersStudy.Data.Database;
using SojournersStudy.Models;
using SojournersStudy.Search;
using SojournersStudy.Seeding;
using SojournersStudy.Services;

namespace SojournersStudy.Pages;

/// <summary>
/// The main study workspace: a tear-out-capable TabView holding whatever a
/// pastor currently has open (Bible chapters, lexicon entries, commentary
/// excerpts), plus the commentary search box (see SearchIndexService).
/// </summary>
public sealed partial class LibraryPage : Page
{
    public ObservableCollection<StudyTabItem> Items { get; } = new();

    public TabView TabViewControl => StudyTabView;

    public LibraryPage()
    {
        InitializeComponent();

        Items.Add(new StudyTabItem
        {
            Header = "Romans 8",
            IconGlyph = "",
            Kind = TabContentKind.Reading,
            ReadingBook = 45,
            ReadingChapter = 8,
        });

        var db = SojournersDatabase.CreateDefault();
        var johnWords = DemoDataSeeder.EnsureJohn1_1Seeded(db);
        Items.Add(new StudyTabItem
        {
            Header = "John 1:1",
            IconGlyph = "",
            Kind = TabContentKind.Interlinear,
            InterlinearWords = new ObservableCollection<Data.Models.OriginalTextWord>(johnWords),
        });

        SearchIndexService.EnsureIndexed();
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

    private void SearchBox_TextChanged(AutoSuggestBox sender, AutoSuggestBoxTextChangedEventArgs args)
    {
        if (args.Reason != AutoSuggestionBoxTextChangeReason.UserInput || string.IsNullOrWhiteSpace(sender.Text))
        {
            sender.ItemsSource = null;
            return;
        }

        TantivySearchIndex index = SearchIndexService.GetOrOpen();
        IReadOnlyList<SearchHit> hits;
        try
        {
            hits = index.Search(sender.Text, limit: 10);
        }
        catch (InvalidOperationException)
        {
            // A malformed in-progress query (e.g. an unbalanced quote while typing) -- just show no suggestions until it parses.
            sender.ItemsSource = null;
            return;
        }

        sender.ItemsSource = hits.Select(hit =>
        {
            (int book, int chapter, _) = BcvReference.Decode((int)hit.LinkedBcvs[0]);
            string snippet = hit.TextBody.Length > 120 ? hit.TextBody[..120] + "…" : hit.TextBody;
            return new SearchResultItem { Author = hit.Author, Snippet = snippet, Book = book, Chapter = chapter };
        }).ToList();
    }

    private void SearchBox_SuggestionChosen(AutoSuggestBox sender, AutoSuggestBoxSuggestionChosenEventArgs args)
    {
        if (args.SelectedItem is not SearchResultItem result)
        {
            return;
        }

        Items.Add(new StudyTabItem
        {
            Header = $"{BibleBooks.Get(result.Book).Name} {result.Chapter}",
            IconGlyph = "",
            Kind = TabContentKind.Reading,
            ReadingBook = result.Book,
            ReadingChapter = result.Chapter,
        });
        StudyTabView.SelectedIndex = Items.Count - 1;
    }
}
