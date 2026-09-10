using System.Data;
using System.Xml;
using System.Xml.Linq;
using SojournersStudy.Data.Models;
using SojournersStudy.Data.Repositories;

namespace SojournersStudy.Importer;

/// <summary>
/// Imports Strong's Dictionary (reference/strongs/greek.xml, hebrew.xml).
/// The two files come from different sources and use entirely different XML
/// shapes (verified against the real files, not assumed to match): greek.xml
/// is a flat custom-DTD document with one &lt;entry strongs="00001"&gt; per
/// word; hebrew.xml is OSIS XML with &lt;div type="entry" n="1"&gt; and a
/// numbered-sense &lt;list&gt;. Each gets its own parser below.
/// </summary>
public static class LexiconImporter
{
    public static int ImportGreek(IDbConnection db, string xmlPath)
    {
        // The internal DTD subset only declares element/attribute structure
        // (no external entities); DtdProcessing.Parse lets XDocument read
        // past the DOCTYPE instead of the default Prohibit throwing on it.
        var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Parse };
        using XmlReader xmlReader = XmlReader.Create(xmlPath, settings);
        XDocument doc = XDocument.Load(xmlReader);

        int count = 0;
        foreach (XElement entry in doc.Descendants("entry"))
        {
            string? strongsAttr = (string?)entry.Attribute("strongs");
            if (strongsAttr is null || !int.TryParse(strongsAttr, out int number))
            {
                continue;
            }

            XElement? greekEl = entry.Element("greek");
            string originalWord = (string?)greekEl?.Attribute("unicode") ?? string.Empty;
            string? translit = (string?)greekEl?.Attribute("translit");
            string? pronunciation = (string?)entry.Element("pronunciation")?.Attribute("strongs");
            string definition = entry.Element("strongs_def")?.Value.Trim() ?? string.Empty;
            string? kjvUsage = entry.Element("kjv_def")?.Value.Trim();

            if (originalWord.Length == 0 || definition.Length == 0)
            {
                continue;
            }

            LexiconRepository.UpsertEntry(db, new LexiconEntry
            {
                StrongsId = $"G{number}",
                OriginalWord = originalWord,
                Transliteration = translit,
                Pronunciation = pronunciation,
                Definition = definition,
                KjvUsage = kjvUsage,
            });
            count++;
        }

        return count;
    }

    public static int ImportHebrew(IDbConnection db, string xmlPath)
    {
        XNamespace osis = "http://www.bibletechnologies.net/2003/OSIS/namespace";
        XDocument doc = XDocument.Load(xmlPath);

        int count = 0;
        foreach (XElement entryDiv in doc.Descendants(osis + "div").Where(e => (string?)e.Attribute("type") == "entry"))
        {
            XElement? wordEl = entryDiv.Element(osis + "w");
            string? id = (string?)wordEl?.Attribute("ID");
            if (id is null)
            {
                continue;
            }

            string originalWord = (string?)wordEl?.Attribute("lemma") ?? wordEl?.Value.Trim() ?? string.Empty;
            string? translit = (string?)wordEl?.Attribute("xlit");

            List<string> senses = entryDiv.Element(osis + "list")?.Elements(osis + "item").Select(i => i.Value.Trim()).ToList() ?? [];
            string? translationNote = entryDiv.Elements(osis + "note").FirstOrDefault(n => (string?)n.Attribute("type") == "translation")?.Value.Trim();

            if (originalWord.Length == 0 || senses.Count == 0)
            {
                continue;
            }

            LexiconRepository.UpsertEntry(db, new LexiconEntry
            {
                StrongsId = id,
                OriginalWord = originalWord,
                // No separate pronunciation guide in this source (unlike
                // greek.xml) -- transliteration alone communicates it well
                // enough; leaving Pronunciation null avoids a pointless
                // duplicate of the same value under two field labels.
                Transliteration = translit,
                Definition = string.Join(" ", senses),
                KjvUsage = translationNote,
            });
            count++;
        }

        return count;
    }
}
