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
/// text (EB Garamond) with a confessional-citation badge injected after any
/// verse the Westminster Standards cite, and a live TextHighlighter search
/// box. Queries the database itself from Book/Chapter (see StudyTabItem's
/// own comment on why tab content stays plain data rather than pre-loaded
/// rows).
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

            ChapterParagraph.Inlines.Add(new Run { Text = $"{verseNumber} ", FontWeight = FontWeights.Bold, FontSize = 12 });
            ChapterParagraph.Inlines.Add(new Run { Text = verse.VerseText + "  " });

            List<ConfessionalProofText> citations = ConfessionsRepository.GetProofTextsForVerse(conn, verse.BcvId).ToList();
            foreach (var group in citations.GroupBy(c => (c.DocumentId, c.ChapterNum)))
            {
                if (!documentsById.TryGetValue(group.Key.DocumentId, out ConfessionalDocument? document))
                {
                    continue;
                }

                // A Hyperlink (not InlineUIContainer+Button): its content is
                // plain Run text, so it has a predictable, exactly-summable
                // length in TextHighlighter's character-offset space. An
                // InlineUIContainer wrapping a real control does not -- its
                // actual cost there isn't documented, and empirically isn't
                // the fixed 1-position assumption a first attempt at this
                // made (confirmed by highlight drift proportional to
                // accumulated badge text, visible once the badges' own text
                // grew across a chapter). The tradeoff is the confirmation
                // Flyout anchors to the whole RichTextBlock rather than the
                // exact badge, since a Hyperlink has no UIElement of its own
                // to call FlyoutBase.ShowAt on.
                int documentId = document.DocumentId;
                int chapterNum = group.Key.ChapterNum;
                var badgeLink = new Hyperlink();
                badgeLink.Inlines.Add(new Run { Text = $"[{document.Code} {chapterNum}]" });
                badgeLink.Click += (_, _) => ShowConfessionFlyout(documentId, chapterNum);
                ChapterParagraph.Inlines.Add(badgeLink);
                ChapterParagraph.Inlines.Add(new Run { Text = " " });
            }
        }

        int chapterStart = BcvReference.ChapterStart(Book, Chapter);
        int chapterEnd = BcvReference.ChapterEnd(Book, Chapter);
        CommentaryList.ItemsSource = WorksRepository.GetBlocksOverlappingRange(conn, chapterStart, chapterEnd).ToList();

        ApplyHighlight(SearchBox.Text);
    }

    private void CommentaryToggle_Click(object sender, RoutedEventArgs e) => CommentarySplitView.IsPaneOpen = !CommentarySplitView.IsPaneOpen;

    private void ShowConfessionFlyout(int documentId, int chapterNum)
    {
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

        new Flyout { Content = new ScrollViewer { Content = panel, MaxHeight = 400 } }.ShowAt(ChapterBlock);
    }

    private void SearchBox_TextChanged(object sender, TextChangedEventArgs e) => ApplyHighlight(SearchBox.Text);

    /// TextHighlighter ranges are character offsets into the RichTextBlock's
    /// flattened plain-text content. Rather than re-deriving that offset in
    /// a second, parallel computation (the previous version of this method
    /// did, and it drifted out of sync with LoadChapter's actual output --
    /// see the badge-construction comment above), this walks the real,
    /// already-built Inlines collections directly, so the count can never
    /// diverge from what's actually on screen.
    private void ApplyHighlight(string? term)
    {
        ChapterBlock.TextHighlighters.Clear();
        if (string.IsNullOrWhiteSpace(term))
        {
            return;
        }

        var highlighter = new TextHighlighter
        {
            Background = new Microsoft.UI.Xaml.Media.SolidColorBrush(Microsoft.UI.Colors.Yellow),
            Foreground = new Microsoft.UI.Xaml.Media.SolidColorBrush(Microsoft.UI.Colors.Black),
        };

        int offset = 0;
        foreach (Paragraph paragraph in new[] { TitleParagraph, ChapterParagraph })
        {
            foreach (Inline inline in paragraph.Inlines)
            {
                offset = ScanInline(inline, term, offset, highlighter);
            }

            offset += 1; // Implicit break between this block and the next.
        }

        if (highlighter.Ranges.Count > 0)
        {
            ChapterBlock.TextHighlighters.Add(highlighter);
        }
    }

    /// Recursively walks one inline, returning the offset just past its end.
    /// Run contributes its own text length; Span-derived inlines (Hyperlink
    /// included) contribute the sum of their children -- both are exact,
    /// unlike an embedded UIElement's cost in this coordinate space.
    private static int ScanInline(Inline inline, string term, int offset, TextHighlighter highlighter)
    {
        if (inline is Run run)
        {
            int searchFrom = 0;
            while (true)
            {
                int index = run.Text.IndexOf(term, searchFrom, StringComparison.OrdinalIgnoreCase);
                if (index < 0)
                {
                    break;
                }

                highlighter.Ranges.Add(new TextRange { StartIndex = offset + index, Length = term.Length });
                searchFrom = index + term.Length;
            }

            return offset + run.Text.Length;
        }

        if (inline is Span span)
        {
            foreach (Inline child in span.Inlines)
            {
                offset = ScanInline(child, term, offset, highlighter);
            }

            return offset;
        }

        return offset + 1;
    }
}
