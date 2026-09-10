using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SojournersStudy.Data.Models;

namespace SojournersStudy.Views;

/// <summary>
/// The Greek/Hebrew deep-dive: each word of a verse/chapter rendered as a
/// column (original word / parsing / gloss), backed by Original_Texts data.
/// Double-tapping a word opens a placeholder lexicon flyout -- swapping in a
/// real Thayer's/BDB lookup is later work; the interaction point is wired up
/// now so that phase is a data change, not a UI change.
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

        var content = new StackPanel { Spacing = 4, Padding = new Thickness(4), MinWidth = 200 };
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

        content.Children.Add(new TextBlock
        {
            Text = "Full lexicon entry (Thayer's/BDB) arrives in a later phase.",
            Opacity = 0.6,
            FontStyle = global::Windows.UI.Text.FontStyle.Italic,
            TextWrapping = TextWrapping.Wrap,
        });

        new Flyout { Content = content }.ShowAt(element);
    }
}
