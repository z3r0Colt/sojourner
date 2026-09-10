using SojournersStudy.Data;
using SojournersStudy.Data.Database;
using SojournersStudy.Data.Models;
using SojournersStudy.Data.Repositories;

namespace SojournersStudy.Seeding;

/// <summary>
/// Seeds a small amount of real (not placeholder-garbage) morphology data so
/// the interlinear view has something genuine to display before a real
/// import pipeline exists. John 1:1 is chosen deliberately: the anarthrous
/// predicate nominative in "καὶ θεὸς ἦν ὁ λόγος" is a real, well-known
/// example of why word-by-word Greek order matters -- exactly what an
/// interlinear tool is for.
/// </summary>
public static class DemoDataSeeder
{
    public static List<OriginalTextWord> EnsureJohn1_1Seeded(SojournersDatabase db)
    {
        using var conn = db.OpenConnection();
        int bcv = BcvReference.Encode(book: 43, chapter: 1, verse: 1);

        var existing = OriginalTextRepository.GetWordsForVerse(conn, bcv).ToList();
        if (existing.Count > 0)
        {
            return existing;
        }

        (string Surface, string Lemma, string Strongs, string Morph, string Gloss)[] words =
        [
            ("Ἐν", "ἐν", "G1722", "PREP", "In"),
            ("ἀρχῇ", "ἀρχή", "G746", "N-DSF", "the beginning"),
            ("ἦν", "εἰμί", "G1510", "V-IAI-3S", "was"),
            ("ὁ", "ὁ", "G3588", "T-NSM", "the"),
            ("λόγος", "λόγος", "G3056", "N-NSM", "Word"),
            ("καὶ", "καί", "G2532", "CONJ", "and"),
            ("ὁ", "ὁ", "G3588", "T-NSM", "the"),
            ("λόγος", "λόγος", "G3056", "N-NSM", "Word"),
            ("ἦν", "εἰμί", "G1510", "V-IAI-3S", "was"),
            ("πρὸς", "πρός", "G4314", "PREP", "with"),
            ("τὸν", "ὁ", "G3588", "T-ASM", "the"),
            ("θεόν", "θεός", "G2316", "N-ASM", "God"),
            ("καὶ", "καί", "G2532", "CONJ", "and"),
            ("θεὸς", "θεός", "G2316", "N-NSM", "God"),
            ("ἦν", "εἰμί", "G1510", "V-IAI-3S", "was"),
            ("ὁ", "ὁ", "G3588", "T-NSM", "the"),
            ("λόγος", "λόγος", "G3056", "N-NSM", "Word"),
        ];

        for (int i = 0; i < words.Length; i++)
        {
            (string surface, string lemma, string strongs, string morph, string gloss) = words[i];
            OriginalTextRepository.UpsertWord(conn, new OriginalTextWord
            {
                BcvId = bcv,
                WordOrder = i,
                SurfaceWord = surface,
                Lemma = lemma,
                StrongsNumber = strongs,
                MorphCode = morph,
                Gloss = gloss,
            });
        }

        return OriginalTextRepository.GetWordsForVerse(conn, bcv).ToList();
    }
}
