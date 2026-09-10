using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Documents;
using SojournersStudy.Data;
using SojournersStudy.Data.Database;
using SojournersStudy.Data.Models;
using SojournersStudy.Data.Repositories;

namespace SojournersStudy.Views;

/// <summary>
/// The main chapter reading experience: a RichTextBlock rendering real KJV
/// text (EB Garamond) with a confessional-citation badge (InlineUIContainer)
/// injected after any verse the Westminster Standards cite, and a live
/// TextHighlighter search box. Queries the database itself from Book/Chapter
/// (see StudyTabItem's own comment on why tab content stays plain data
/// rather than pre-loaded rows).
/// </summary>
public sealed partial class ReadingView : UserControl
{
    public static readonly DependencyProperty BookProperty =
        DependencyProperty.Register(nameof(Book), typeof(int), typeof(ReadingView), new PropertyMetadata(0, OnReferenceChanged));

    public static readonly DependencyProperty ChapterProperty =
        DependencyProperty.Register(nameof(Chapter), typeof(int), typeof(ReadingView), new PropertyMetadata(0, OnReferenceChanged));

    public int Book
    {
        get => (int)GetValue(BookProperty);
        set => SetValue(BookProperty, value);
    }

    public int Chapter
    {
        get => (int)GetValue(ChapterProperty);
        set => SetValue(ChapterProperty, value);
    }

    private List<BibleVerse> _verses = [];
    private bool _loaded;

    public ReadingView()
    {
        InitializeComponent();
        Loaded += (_, _) =>
        {
            _loaded = true;
            LoadChapter();
        };
    }

    private static void OnReferenceChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is ReadingView { _loaded: true } view)
        {
            view.LoadChapter();
        }
    }

    private void LoadChapter()
    {
        if (Book is < 1 or > 66 || Chapter < 1)
        {
            return;
        }

        var db = SojournersDatabase.CreateDefault();
        using var conn = db.OpenConnection();

        BibleTranslation? translation = BibleRepository.GetTranslationByCode(conn, "KJV");
        if (translation is null)
        {
            TitleParagraph.Inlines.Clear();
            TitleParagraph.Inlines.Add(new Run { Text = "No Bible text imported yet -- run SojournersStudy.Importer." });
            return;
        }

        _verses = BibleRepository.GetChapterVerses(conn, Book, Chapter, translation.TranslationId).ToList();
        Dictionary<int, ConfessionalDocument> documentsById = ConfessionsRepository.GetDocuments(conn).ToDictionary(d => d.DocumentId);

        TitleParagraph.Inlines.Clear();
        TitleParagraph.Inlines.Add(new Run { Text = $"{BibleBooks.Get(Book).Name} {Chapter}" });

        ChapterParagraph.Inlines.Clear();
        foreach (BibleVerse verse in _verses)
        {
            (_, _, int verseNumber) = BcvReference.Decode(verse.BcvId);

            var verseNumberRun = new Run { Text = $"{verseNumber} ", FontWeight = FontWeights.Bold, FontSize = 12 };
            ChapterParagraph.Inlines.Add(verseNumberRun);

            var verseTextRun = new Run { Text = verse.VerseText + "  " };
            ChapterParagraph.Inlines.Add(verseTextRun);

            List<ConfessionalProofText> citations = ConfessionsRepository.GetProofTextsForVerse(conn, verse.BcvId).ToList();
            foreach (var group in citations.GroupBy(c => (c.DocumentId, c.ChapterNum)))
            {
                if (!documentsById.TryGetValue(group.Key.DocumentId, out ConfessionalDocument? document))
                {
                    continue;
                }

                var badge = new Button
                {
                    Content = $"{document.Code} {group.Key.ChapterNum}",
                    Padding = new Thickness(6, 0, 6, 0),
                    FontSize = 11,
                    Tag = (document.DocumentId, group.Key.ChapterNum),
                };
                badge.Click += Badge_Click;
                ChapterParagraph.Inlines.Add(new InlineUIContainer { Child = badge });
                ChapterParagraph.Inlines.Add(new Run { Text = " " });
            }
        }

        ApplyHighlight(SearchBox.Text);
    }

    private void Badge_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: (int documentId, int chapterNum) })
        {
            return;
        }

        var db = SojournersDatabase.CreateDefault();
        using var conn = db.OpenConnection();
        List<ConfessionalSection> sections = ConfessionsRepository.GetSections(conn, documentId, chapterNum, articleNum: null).ToList();
        if (sections.Count == 0)
        {
            return;
        }

        var panel = new StackPanel { Spacing = 8, Padding = new Thickness(4), MaxWidth = 420 };
        foreach (ConfessionalSection section in sections)
        {
            string label = section.ArticleNum is int article ? $"{chapterNum}.{article}" : $"{chapterNum}";
            panel.Children.Add(new TextBlock { Text = label, FontWeight = FontWeights.Bold });
            panel.Children.Add(new TextBlock { Text = section.ContentText, TextWrapping = TextWrapping.Wrap });
        }

        new Flyout { Content = new ScrollViewer { Content = panel, MaxHeight = 400 } }.ShowAt((FrameworkElement)sender);
    }

    private void SearchBox_TextChanged(object sender, TextChangedEventArgs e) => ApplyHighlight(SearchBox.Text);

    /// TextHighlighter ranges are character offsets into the RichTextBlock's
    /// flattened plain-text content, so this walks the same inlines built in
    /// LoadChapter (verse-number run, verse-text run, badge InlineUIContainer
    /// (1 position) + its trailing space run) tracking a running offset,
    /// rather than re-deriving structure from the built UI tree.
    private void ApplyHighlight(string? term)
    {
        ChapterBlock.TextHighlighters.Clear();
        if (string.IsNullOrWhiteSpace(term) || _verses.Count == 0)
        {
            return;
        }

        var highlighter = new TextHighlighter
        {
            Background = new Microsoft.UI.Xaml.Media.SolidColorBrush(Microsoft.UI.Colors.Yellow),
            Foreground = new Microsoft.UI.Xaml.Media.SolidColorBrush(Microsoft.UI.Colors.Black),
        };

        int offset = TitleParagraph.Inlines.Sum(TextLength) + 1; // RichTextBlock separates blocks with an implicit break.
        using var db = SojournersDatabase.CreateDefault().OpenConnection();
        foreach (BibleVerse verse in _verses)
        {
            (_, _, int verseNumber) = BcvReference.Decode(verse.BcvId);
            offset += $"{verseNumber} ".Length;

            string text = verse.VerseText;
            int searchFrom = 0;
            while (true)
            {
                int index = text.IndexOf(term, searchFrom, StringComparison.OrdinalIgnoreCase);
                if (index < 0)
                {
                    break;
                }

                highlighter.Ranges.Add(new TextRange { StartIndex = offset + index, Length = term.Length });
                searchFrom = index + term.Length;
            }

            offset += text.Length + 2; // "  " trailing separator added in LoadChapter.

            int badgeCount = ConfessionsRepository.GetProofTextsForVerse(db, verse.BcvId)
                .Select(c => (c.DocumentId, c.ChapterNum)).Distinct().Count();
            offset += badgeCount * 2; // each badge: 1 position for the InlineUIContainer + 1-length trailing space run.
        }

        if (highlighter.Ranges.Count > 0)
        {
            ChapterBlock.TextHighlighters.Add(highlighter);
        }
    }

    private static int TextLength(Inline inline) => inline is Run run ? run.Text.Length : 1;
}
