using System.Data;
using System.Xml.Linq;
using SojournersStudy.Data;
using SojournersStudy.Data.Models;
using SojournersStudy.Data.Repositories;

namespace SojournersStudy.Importer;

/// <summary>Imports one Zefania-format Bible XML file (see bibles/*.xml) into Bible_Translations/Bible_Verses.</summary>
public static class BibleImporter
{
    public static int Import(IDbConnection db, string xmlPath, string code, string displayName, int? year)
    {
        XDocument doc = XDocument.Load(xmlPath);
        XElement root = doc.Root ?? throw new InvalidDataException($"'{xmlPath}' has no root element.");

        int translationId = BibleRepository.UpsertTranslation(db, new BibleTranslation
        {
            Code = code,
            DisplayName = displayName,
            Year = year,
        });

        int count = 0;
        foreach (XElement bookEl in root.Elements("BIBLEBOOK"))
        {
            int bookNumber = (int)bookEl.Attribute("bnumber")!;
            if (bookNumber is < 1 or > 66)
            {
                // Apocryphal/deuterocanonical books in some translations fall
                // outside the 66-book BCV scheme -- skip rather than force a
                // bad encoding.
                continue;
            }

            foreach (XElement chapterEl in bookEl.Elements("CHAPTER"))
            {
                int chapterNumber = (int)chapterEl.Attribute("cnumber")!;
                foreach (XElement verseEl in chapterEl.Elements("VERS"))
                {
                    int verseNumber = (int)verseEl.Attribute("vnumber")!;
                    string text = verseEl.Value.Trim();
                    if (text.Length == 0)
                    {
                        continue;
                    }

                    int bcv = BcvReference.Encode(bookNumber, chapterNumber, verseNumber);
                    BibleRepository.UpsertVerse(db, new BibleVerse { BcvId = bcv, TranslationId = translationId, VerseText = text });
                    count++;
                }
            }
        }

        return count;
    }
}
