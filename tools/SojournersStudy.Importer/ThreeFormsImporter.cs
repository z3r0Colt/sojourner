using System.Data;
using System.Text.Json;
using System.Text.RegularExpressions;
using SojournersStudy.Data.Models;
using SojournersStudy.Data.Repositories;

namespace SojournersStudy.Importer;

/// <summary>
/// Imports the Three Forms of Unity (reference/confessions/heidelberg.json,
/// belgic.json, canons_of_dort.json) as browsable text only -- unlike the
/// Westminster Standards, none of these three files carry scripture proof
/// texts, so no Confessional_Proof_Texts rows come from this importer (there
/// is nothing to link a bcv_id to).
/// </summary>
public static partial class ThreeFormsImporter
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public static int ImportHeidelbergCatechism(IDbConnection db, string jsonPath)
    {
        int documentId = ConfessionsRepository.UpsertDocument(db, new ConfessionalDocument { Code = "HEIDELBERG", Title = "Heidelberg Catechism" });
        ConfessionsRepository.DeleteSectionsForDocument(db, documentId);

        List<HeidelbergPart> parts = JsonSerializer.Deserialize<List<HeidelbergPart>>(File.ReadAllText(jsonPath), JsonOptions)
            ?? throw new InvalidDataException($"'{jsonPath}' did not deserialize to a list of HeidelbergPart.");

        int sortOrder = 0;
        int count = 0;
        foreach (HeidelbergPart part in parts)
        {
            foreach (HeidelbergLordsDay lordsDay in part.LordsDays)
            {
                int lordsDayNumber = ExtractLeadingNumber(lordsDay.Title);
                int questionIndex = 0;
                foreach (HeidelbergQa qa in lordsDay.Qas)
                {
                    questionIndex++;
                    ConfessionsRepository.InsertSection(db, new ConfessionalSection
                    {
                        DocumentId = documentId,
                        ChapterNum = lordsDayNumber,
                        ArticleNum = questionIndex,
                        Heading = qa.Q,
                        ContentText = string.Join('\n', qa.AParagraphs),
                        SortOrder = sortOrder++,
                    });
                    count++;
                }
            }
        }

        return count;
    }

    public static int ImportBelgicConfession(IDbConnection db, string jsonPath) =>
        ImportProseArticles(db, jsonPath, "BELGIC", "Belgic Confession");

    public static int ImportCanonsOfDort(IDbConnection db, string jsonPath) =>
        ImportProseArticles(db, jsonPath, "CANONS_OF_DORT", "Canons of Dort");

    private static int ImportProseArticles(IDbConnection db, string jsonPath, string code, string title)
    {
        int documentId = ConfessionsRepository.UpsertDocument(db, new ConfessionalDocument { Code = code, Title = title });
        ConfessionsRepository.DeleteSectionsForDocument(db, documentId);

        List<ProseSection> sections = JsonSerializer.Deserialize<List<ProseSection>>(File.ReadAllText(jsonPath), JsonOptions)
            ?? throw new InvalidDataException($"'{jsonPath}' did not deserialize to a list of ProseSection.");

        int sortOrder = 0;
        foreach (ProseSection section in sections)
        {
            Match match = ArticleNumberRegex().Match(section.Heading);
            int? articleNum = match.Success ? int.Parse(match.Groups[1].Value) : null;

            ConfessionsRepository.InsertSection(db, new ConfessionalSection
            {
                DocumentId = documentId,
                ChapterNum = null,
                ArticleNum = articleNum,
                Heading = section.Heading,
                ContentText = string.Join("\n\n", section.Paragraphs),
                SortOrder = sortOrder++,
            });
        }

        return sections.Count;
    }

    private static int ExtractLeadingNumber(string text)
    {
        Match match = LeadingNumberRegex().Match(text);
        return match.Success ? int.Parse(match.Groups[1].Value) : 0;
    }

    [GeneratedRegex(@"(\d+)")]
    private static partial Regex LeadingNumberRegex();

    [GeneratedRegex(@"Article (\d+):")]
    private static partial Regex ArticleNumberRegex();
}
