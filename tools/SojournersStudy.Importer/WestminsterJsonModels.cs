using System.Text.Json.Serialization;

namespace SojournersStudy.Importer;

public sealed class WestminsterProof
{
    public int Id { get; set; }
    public List<string> References { get; set; } = [];
}

public sealed class ConfessionFile
{
    public List<ConfessionChapter> Data { get; set; } = [];
}

public sealed class ConfessionChapter
{
    public string Chapter { get; set; } = string.Empty;
    public List<ConfessionSection> Sections { get; set; } = [];
}

public sealed class ConfessionSection
{
    public string Content { get; set; } = string.Empty;
    public List<WestminsterProof> Proofs { get; set; } = [];
}

public sealed class CatechismFile
{
    public List<CatechismQuestion> Data { get; set; } = [];
}

public sealed class CatechismQuestion
{
    public int Number { get; set; }
    public string Question { get; set; } = string.Empty;
    public string Answer { get; set; } = string.Empty;
    public List<WestminsterProof> Proofs { get; set; } = [];
}
