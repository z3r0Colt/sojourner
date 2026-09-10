using System.Data;
using System.Net;
using System.Text.RegularExpressions;
using SojournersStudy.Data;
using SojournersStudy.Data.Models;
using SojournersStudy.Data.Repositories;

namespace SojournersStudy.Importer;

/// <summary>
/// Imports Matthew Henry's Commentary on the Whole Bible from CCEL's ThML
/// markup (commentaries/matthew henry/mhc*.xml). Scoped to Romans only for
/// this pass (matching the ReadingView's Romans 8 demo) rather than the
/// full 66-book corpus -- a general ThML importer covering every book's
/// quirks is a substantial project of its own (the old Rust app's thml.rs
/// took real, dedicated effort to get right); this is a real, working
/// parser for the one book actually needed right now, not a stub.
///
/// Structure (verified against the actual file, not assumed): each
/// commentary passage is a `&lt;scripCom type="Commentary" parsed="|Rom|
/// startCh|startV|endCh|endV" .../&gt;` marker immediately followed by a
/// sibling `&lt;div class="Commentary" id="..."&gt;...&lt;/div&gt;` holding the
/// actual prose (which can itself contain nested divs, so extracting it
/// needs balanced-tag tracking, not a single non-greedy regex). A whole-
/// chapter overview block uses endCh=endV=0.
/// </summary>
public static partial class MatthewHenryImporter
{
    public static int ImportRomans(IDbConnection db, string thmlPath, Func<int, int, int> maxVerseForChapter)
    {
        const int romansBookNumber = 45;
        string content = File.ReadAllText(thmlPath);

        int bookStart = content.IndexOf("<div1 title=\"Romans\"", StringComparison.Ordinal);
        if (bookStart < 0)
        {
            throw new InvalidDataException($"Could not find the Romans section in '{thmlPath}'.");
        }

        int nextBookStart = content.IndexOf("<div1 ", bookStart + 1, StringComparison.Ordinal);
        string section = nextBookStart > 0 ? content[bookStart..nextBookStart] : content[bookStart..];

        int workId = WorksRepository.UpsertWork(db, new WorksCatalogEntry
        {
            Author = "Matthew Henry",
            Title = "Commentary on the Whole Bible: Romans",
            Year = 1710,
        });
        WorksRepository.DeleteBlocksForWork(db, workId);

        int sortOrder = 0;
        int blockCount = 0;
        foreach (Match marker in ScripComMarkerRegex().Matches(section))
        {
            int startCh = int.Parse(marker.Groups["startCh"].Value);
            int startV = int.Parse(marker.Groups["startV"].Value);
            int endCh = int.Parse(marker.Groups["endCh"].Value);
            int endV = int.Parse(marker.Groups["endV"].Value);

            int searchStart = marker.Index + marker.Length;
            int divOpenIndex = section.IndexOf("<div class=\"Commentary\"", searchStart, StringComparison.Ordinal);
            if (divOpenIndex < 0 || section[searchStart..divOpenIndex].Trim().Length > 0)
            {
                // Nothing (or something other than whitespace, e.g. another
                // scripCom marker) intervenes before the next Commentary div
                // -- this marker has no content div of its own. Real example:
                // a whole-chapter overview marker (endCh=endV=0) whose text
                // already lives in the chapter's intro paragraph rather than
                // its own div.
                continue;
            }

            string? innerHtml = ExtractBalancedDivContent(section, divOpenIndex);
            if (innerHtml is null)
            {
                continue;
            }

            string plainText = HtmlToPlainText(innerHtml);
            if (plainText.Length == 0)
            {
                continue;
            }

            int startBcv, endBcv;
            if (endCh == 0 && endV == 0)
            {
                startBcv = BcvReference.ChapterStart(romansBookNumber, startCh);
                endBcv = BcvReference.Encode(romansBookNumber, startCh, maxVerseForChapter(romansBookNumber, startCh));
            }
            else
            {
                startBcv = BcvReference.Encode(romansBookNumber, startCh, startV);
                endBcv = BcvReference.Encode(romansBookNumber, endCh, endV);
            }

            WorksRepository.InsertContentBlock(db, new WorkContentBlock
            {
                WorkId = workId,
                StartBcv = startBcv,
                EndBcv = endBcv,
                BodyText = plainText,
                SortOrder = sortOrder++,
            });
            blockCount++;
        }

        return blockCount;
    }

    /// Scans forward from a `&lt;div ...&gt;` opening tag, tracking nesting
    /// depth, to find its matching close tag -- a non-greedy regex would stop
    /// at the first nested `&lt;/div&gt;` instead of the real end.
    private static string? ExtractBalancedDivContent(string text, int divOpenIndex)
    {
        int contentStart = text.IndexOf('>', divOpenIndex);
        if (contentStart < 0)
        {
            return null;
        }

        contentStart++;
        int depth = 1;
        int pos = contentStart;
        while (depth > 0)
        {
            int nextOpen = text.IndexOf("<div", pos, StringComparison.Ordinal);
            int nextClose = text.IndexOf("</div>", pos, StringComparison.Ordinal);
            if (nextClose < 0)
            {
                return null;
            }

            if (nextOpen >= 0 && nextOpen < nextClose)
            {
                depth++;
                pos = nextOpen + 4;
            }
            else
            {
                depth--;
                if (depth == 0)
                {
                    return text[contentStart..nextClose];
                }

                pos = nextClose + 6;
            }
        }

        return null;
    }

    private static string HtmlToPlainText(string html)
    {
        string withoutTags = HtmlTagRegex().Replace(html, " ");
        string decoded = WebUtility.HtmlDecode(withoutTags);
        return WhitespaceRegex().Replace(decoded, " ").Trim();
    }

    [GeneratedRegex("""<scripCom\s+type="Commentary"[^>]*\bparsed="\|Rom\|(?<startCh>\d+)\|(?<startV>\d+)\|(?<endCh>\d+)\|(?<endV>\d+)"[^>]*/>""")]
    private static partial Regex ScripComMarkerRegex();

    [GeneratedRegex("<[^>]+>")]
    private static partial Regex HtmlTagRegex();

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceRegex();
}
