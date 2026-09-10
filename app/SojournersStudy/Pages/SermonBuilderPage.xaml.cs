using System.Text;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml.Controls;
using SojournersStudy.Data;
using SojournersStudy.Data.Database;
using SojournersStudy.Data.Models;
using SojournersStudy.Data.Repositories;
using Windows.Storage.Streams;

namespace SojournersStudy.Pages;

public sealed partial class SermonBuilderPage : Page
{
    private int? _sermonId;

    public SermonBuilderPage()
    {
        InitializeComponent();
        BookCombo.ItemsSource = BibleBooks.All;
        BookCombo.SelectedIndex = 44; // Romans, index 44 in the 1-66 list -- a reasonable default, not load-bearing.
    }

    private void Save_Click(object sender, Microsoft.UI.Xaml.RoutedEventArgs e)
    {
        string title = string.IsNullOrWhiteSpace(TitleBox.Text) ? "Untitled Sermon" : TitleBox.Text;
        int? startBcv = null;
        int? endBcv = null;
        if (BookCombo.SelectedItem is BibleBook book && ChapterBox.Value is double chapterValue && !double.IsNaN(chapterValue))
        {
            int chapter = (int)chapterValue;
            startBcv = BcvReference.ChapterStart(book.Number, chapter);
            endBcv = BcvReference.ChapterEnd(book.Number, chapter);
        }

        string rtf = GetManuscriptRtf();
        string now = DateTimeOffset.UtcNow.ToString("O");

        var db = SojournersDatabase.CreateDefault();
        using var conn = db.OpenConnection();
        if (_sermonId is int existingId)
        {
            SermonRepository.UpdateSermon(conn, new SermonManuscript
            {
                SermonId = existingId,
                Title = title,
                PassageStartBcv = startBcv,
                PassageEndBcv = endBcv,
                LawText = LawBox.Text,
                GospelText = GospelBox.Text,
                BodyRtf = rtf,
                UpdatedAt = now,
            });
        }
        else
        {
            _sermonId = SermonRepository.InsertSermon(conn, new SermonManuscript
            {
                Title = title,
                PassageStartBcv = startBcv,
                PassageEndBcv = endBcv,
                LawText = LawBox.Text,
                GospelText = GospelBox.Text,
                BodyRtf = rtf,
                CreatedAt = now,
                UpdatedAt = now,
            });
        }

        StatusText.Text = $"Saved at {DateTime.Now:t}.";
    }

    private string GetManuscriptRtf()
    {
        using var stream = new InMemoryRandomAccessStream();
        ManuscriptBox.TextDocument.SaveToStream(TextGetOptions.FormatRtf, stream);

        var bytes = new byte[stream.Size];
        using var reader = new DataReader(stream.GetInputStreamAt(0));
        reader.LoadAsync((uint)stream.Size).AsTask().GetAwaiter().GetResult();
        reader.ReadBytes(bytes);
        // SaveToStream includes RichEdit's own trailing null terminator, which has no place in a TEXT column.
        return Encoding.UTF8.GetString(bytes).TrimEnd('\0');
    }
}
