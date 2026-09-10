namespace SojournersStudy.Views;

/// Builds the hover tooltip text for one interlinear word from whatever
/// fields Original_Texts actually has populated -- morph_code/lemma/
/// strongs_number are all nullable, so this degrades gracefully instead of
/// showing "null" fragments.
public static class InterlinearTooltip
{
    public static string Format(string? lemma, string? strongsNumber, string? morphCode)
    {
        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(lemma))
        {
            parts.Add($"Lemma: {lemma}");
        }

        if (!string.IsNullOrWhiteSpace(strongsNumber))
        {
            parts.Add($"Strong's: {strongsNumber}");
        }

        if (!string.IsNullOrWhiteSpace(morphCode))
        {
            parts.Add($"Parsing: {morphCode}");
        }

        return parts.Count > 0 ? string.Join("\n", parts) : "No morphology data";
    }
}
