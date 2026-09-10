using SojournersStudy.Data;
using Xunit;

namespace SojournersStudy.Data.Tests;

public class BcvReferenceTests
{
    [Fact]
    public void Encodes_romans_8_28_matching_the_architecture_doc_example()
    {
        Assert.Equal(45008028, BcvReference.Encode(book: 45, chapter: 8, verse: 28));
    }

    [Fact]
    public void Decode_is_the_inverse_of_encode()
    {
        int bcv = BcvReference.Encode(1, 1, 1);
        Assert.Equal((1, 1, 1), BcvReference.Decode(bcv));

        bcv = BcvReference.Encode(66, 22, 21);
        Assert.Equal((66, 22, 21), BcvReference.Decode(bcv));
    }

    [Theory]
    [InlineData(0, 1, 1)]
    [InlineData(67, 1, 1)]
    public void Encode_rejects_out_of_range_book(int book, int chapter, int verse)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => BcvReference.Encode(book, chapter, verse));
    }

    [Fact]
    public void Chapter_start_and_end_bracket_every_verse_in_that_chapter()
    {
        int start = BcvReference.ChapterStart(45, 8);
        int end = BcvReference.ChapterEnd(45, 8);
        int verse28 = BcvReference.Encode(45, 8, 28);

        Assert.True(verse28 >= start && verse28 <= end);
        // A verse in a different chapter of the same book must fall outside the bracket.
        Assert.True(BcvReference.Encode(45, 9, 1) > end);
        Assert.True(BcvReference.Encode(45, 7, 999) < start);
    }
}
