using System.Data;
using System.Text.Json;
using SojournersStudy.Data.Models;
using SojournersStudy.Data.Repositories;

namespace SojournersStudy.Importer;

/// <summary>
/// Imports the Westminster Standards (reference/westminster/*.json) --
/// clean, structured data with real per-section scripture proof texts,
/// unlike the Three Forms of Unity files (see ThreeFormsImporter's own
/// comment on why those are handled differently).
/// </summary>
public static class WestminsterImporter
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public static (int Sections, int ProofTexts) ImportConfession(IDbConnection db, string jsonPath, Func<int, int, int> maxVerseForChapter)
    {
        int documentId = ConfessionsRepository.UpsertDocument(db, new ConfessionalDocument { Code = "WCF", Title = "Westminster Confession of Faith" });
        ConfessionsRepository.DeleteSectionsForDocument(db, documentId);

        ConfessionFile file = JsonSerializer.Deserialize<ConfessionFile>(File.ReadAllText(jsonPath), JsonOptions)
            ?? throw new InvalidDataException($"'{jsonPath}' did not deserialize to a ConfessionFile.");

        int sortOrder = 0;
        int sectionCount = 0;
        int proofCount = 0;
        foreach (ConfessionChapter chapter in file.Data)
        {
            int chapterNum = int.Parse(chapter.Chapter);
            int articleNum = 0;
            foreach (ConfessionSection section in chapter.Sections)
            {
                articleNum++;
                ConfessionsRepository.InsertSection(db, new ConfessionalSection
                {
                    DocumentId = documentId,
                    ChapterNum = chapterNum,
                    ArticleNum = articleNum,
                    Heading = null,
                    ContentText = section.Content,
                    SortOrder = sortOrder++,
                });
                sectionCount++;

                proofCount += InsertProofTexts(db, documentId, chapterNum, articleNum, section.Proofs, maxVerseForChapter);
            }
        }

        return (sectionCount, proofCount);
    }

    public static (int Sections, int ProofTexts) ImportLargerCatechism(IDbConnection db, string jsonPath, Func<int, int, int> maxVerseForChapter) =>
        ImportCatechism(db, jsonPath, maxVerseForChapter, "WLC", "Westminster Larger Catechism");

    public static (int Sections, int ProofTexts) ImportShorterCatechism(IDbConnection db, string jsonPath) =>
        ImportCatechism(db, jsonPath, maxVerseForChapter: null, "WSC", "Westminster Shorter Catechism");

    private static (int Sections, int ProofTexts) ImportCatechism(IDbConnection db, string jsonPath, Func<int, int, int>? maxVerseForChapter, string code, string title)
    {
        int documentId = ConfessionsRepository.UpsertDocument(db, new ConfessionalDocument { Code = code, Title = title });
        ConfessionsRepository.DeleteSectionsForDocument(db, documentId);

        CatechismFile file = JsonSerializer.Deserialize<CatechismFile>(File.ReadAllText(jsonPath), JsonOptions)
            ?? throw new InvalidDataException($"'{jsonPath}' did not deserialize to a CatechismFile.");

        int sortOrder = 0;
        int sectionCount = 0;
        int proofCount = 0;
        foreach (CatechismQuestion question in file.Data)
        {
            ConfessionsRepository.InsertSection(db, new ConfessionalSection
            {
                DocumentId = documentId,
                ChapterNum = question.Number,
                ArticleNum = null,
                Heading = $"Question {question.Number}. {question.Question}",
                ContentText = question.Answer,
                SortOrder = sortOrder++,
            });
            sectionCount++;

            if (maxVerseForChapter is not null)
            {
                proofCount += InsertProofTexts(db, documentId, question.Number, articleNum: null, question.Proofs, maxVerseForChapter);
            }
        }

        return (sectionCount, proofCount);
    }

    private static int InsertProofTexts(IDbConnection db, int documentId, int chapterNum, int? articleNum, List<WestminsterProof> proofs, Func<int, int, int> maxVerseForChapter)
    {
        var seenBcvs = new HashSet<int>();
        foreach (WestminsterProof proof in proofs)
        {
            foreach (string reference in proof.References)
            {
                List<int> bcvs;
                try
                {
                    bcvs = ScriptureReferenceParser.ParseToBcvList(reference, maxVerseForChapter);
                }
                catch (FormatException ex)
                {
                    Console.WriteLine($"  [skip] {ex.Message}");
                    continue;
                }

                foreach (int bcv in bcvs)
                {
                    seenBcvs.Add(bcv);
                }
            }
        }

        foreach (int bcv in seenBcvs)
        {
            ConfessionsRepository.InsertProofText(db, new ConfessionalProofText
            {
                BcvId = bcv,
                DocumentId = documentId,
                ChapterNum = chapterNum,
                ArticleNum = articleNum,
            });
        }

        return seenBcvs.Count;
    }
}
