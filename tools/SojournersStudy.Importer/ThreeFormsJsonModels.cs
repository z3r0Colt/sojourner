using System.Text.Json.Serialization;

namespace SojournersStudy.Importer;

// reference/confessions/heidelberg.json, belgic.json, canons_of_dort.json use
// lowercase snake_case property names -- a different source/tool than the
// Westminster Standards files (PascalCase), hence explicit JsonPropertyName
// here rather than relying on case-insensitive matching (which doesn't
// bridge "lords_days" to a differently-shaped C# name on its own).

public sealed class HeidelbergPart
{
    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("lords_days")]
    public List<HeidelbergLordsDay> LordsDays { get; set; } = [];
}

public sealed class HeidelbergLordsDay
{
    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("qas")]
    public List<HeidelbergQa> Qas { get; set; } = [];
}

public sealed class HeidelbergQa
{
    [JsonPropertyName("q")]
    public string Q { get; set; } = string.Empty;

    [JsonPropertyName("a_paragraphs")]
    public List<string> AParagraphs { get; set; } = [];
}

public sealed class ProseSection
{
    [JsonPropertyName("level")]
    public string? Level { get; set; }

    [JsonPropertyName("heading")]
    public string Heading { get; set; } = string.Empty;

    [JsonPropertyName("paragraphs")]
    public List<string> Paragraphs { get; set; } = [];
}
