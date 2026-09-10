using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SojournersStudy.Data.Database;
using SojournersStudy.Data.Models;
using SojournersStudy.Data.Repositories;

namespace SojournersStudy.Views;

/// <summary>
/// The Greek/Hebrew deep-dive: each word of a verse/chapter rendered as a
/// column (original word / parsing / gloss), backed by Original_Texts data.
/// Double-tapping a word opens a lexicon flyout backed by Strong's
/// Dictionary (see LexiconImporter's own comment on why that stands in for
/// the architecture doc's Thayer's/BDB ask).
/// </summary>
public sealed partial class InterlinearView : UserControl
{
    public static readonly DependencyProperty WordsProperty = DependencyProperty.Register(
        nameof(Words), typeof(IEnumerable<OriginalTextWord>), typeof(InterlinearView), new PropertyMetadata(null));

    public IEnumerable<OriginalTextWord> Words
    {
        get => (IEnumerable<OriginalTextWord>)GetValue(WordsProperty);
        set => SetValue(WordsProperty, value);
    }

    public InterlinearView()
    {
        InitializeComponent();
    }

    private void Word_DoubleTapped(object sender, Microsoft.UI.Xaml.Input.DoubleTappedRoutedEventArgs e)
    {
        if (sender is not FrameworkElement { DataContext: OriginalTextWord word } element)
        {
            return;
        }

        var content = new StackPanel { Spacing = 4, Padding = new Thickness(4), MinWidth = 220, MaxWidth = 360 };
        content.Children.Add(new TextBlock { Text = word.SurfaceWord, FontSize = 20, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        if (!string.IsNullOrWhiteSpace(word.Lemma))
        {
            content.Children.Add(new TextBlock { Text = $"Lemma: {word.Lemma}" });
        }

        if (!string.IsNullOrWhiteSpace(word.StrongsNumber))
        {
            content.Children.Add(new TextBlock { Text = $"Strong's: {word.StrongsNumber}" });
        }

        if (!string.IsNullOrWhiteSpace(word.MorphCode))
        {
            content.Children.Add(new TextBlock { Text = $"Parsing: {word.MorphCode}" });
        }

        LexiconEntry? entry = null;
        if (!string.IsNullOrWhiteSpace(word.StrongsNumber))
        {
            var db = SojournersDatabase.CreateDefault();
            using var conn = db.OpenConnection();
            entry = LexiconRepository.GetEntry(conn, word.StrongsNumber);
        }

        if (entry is not null)
        {
            content.Children.Add(new Microsoft.UI.Xaml.Controls.MenuFlyoutSeparator());
            if (!string.IsNullOrWhiteSpace(entry.Transliteration))
            {
                content.Children.Add(new TextBlock { Text = entry.Transliteration, FontStyle = global::Windows.UI.Text.FontStyle.Italic, Opacity = 0.8 });
            }

            content.Children.Add(new TextBlock { Text = entry.Definition, TextWrapping = TextWrapping.Wrap });
            if (!string.IsNullOrWhiteSpace(entry.KjvUsage))
            {
                content.Children.Add(new TextBlock { Text = $"KJV usage: {entry.KjvUsage}", TextWrapping = TextWrapping.Wrap, Opacity = 0.7, FontSize = 12 });
            }

            content.Children.Add(new TextBlock { Text = "Strong's Dictionary (1890/1894, public domain)", Opacity = 0.5, FontSize = 11 });
        }
        else
        {
            content.Children.Add(new TextBlock
            {
                Text = "No lexicon entry found for this word.",
                Opacity = 0.6,
                FontStyle = global::Windows.UI.Text.FontStyle.Italic,
                TextWrapping = TextWrapping.Wrap,
            });
        }

        new Flyout { Content = content }.ShowAt(element);
    }
}
