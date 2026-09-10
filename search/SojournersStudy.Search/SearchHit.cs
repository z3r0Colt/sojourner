using System.Text.Json.Serialization;

namespace SojournersStudy.Search;

/// <summary>One search result, deserialized from the JSON the native index returns. Field names are explicit since Rust's serde_json serializes struct fields verbatim (snake_case), not camelCase.</summary>
public sealed class SearchHit
{
    [JsonPropertyName("block_id")]
    public ulong BlockId { get; set; }

    [JsonPropertyName("author")]
    public string Author { get; set; } = string.Empty;

    [JsonPropertyName("text_body")]
    public string TextBody { get; set; } = string.Empty;

    [JsonPropertyName("linked_bcvs")]
    public List<ulong> LinkedBcvs { get; set; } = new();

    [JsonPropertyName("score")]
    public float Score { get; set; }
}
