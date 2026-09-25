import { describe, expect, it } from "vitest";
import { buildPodiumHtml, podiumPages } from "./podiumExport";
import { passageBlockHtml } from "./editor/documentModel";
import { calloutBlockHtml } from "./editor/callouts";
import type { Book, Passage, Sermon } from "../../api/types";

const books = [{ id: 45, name: "Romans" }] as Book[];
const ref = { book_id: 45, chapter: 8, verse_start: 1, verse_end: 2 };
const passages = new Map<string, Passage>([
  [
    "45:8:1:2",
    {
      ref,
      text: "",
      verses: [
        { verse: 1, text: "There is therefore now no condemnation <for> them" },
        { verse: 2, text: "For the law of the Spirit of life" },
      ],
    } as unknown as Passage,
  ],
]);

function sermon(body: string, extra: Partial<Sermon> = {}): Sermon {
  return {
    id: 1,
    title: "No <Condemnation>",
    big_idea: "In Christ, the verdict is in.",
    body,
    status: "draft",
    stage: "text",
    preach_date: "2026-09-27",
    series_id: null,
    series_order: null,
    venue: null,
    preacher: null,
    translation_id: null,
    target_minutes: 30,
    reflection: null,
    created_at: "",
    updated_at: "",
    deleted_at: null,
    passages: [{ id: 1, sermon_id: 1, role: "text", ...ref } as Sermon["passages"][number]],
    sources: [],
    tags: [],
    events: [],
    series_title: null,
    ...extra,
  };
}

const body =
  "<h2>The verdict</h2><p>Opening words.</p>" +
  passageBlockHtml(ref) +
  "<h3>For whom</h3>" +
  calloutBlockHtml("application", "<p>Stop auditioning.</p>") +
  "<h2>The Spirit</h2><p>Life, not law.</p>";

describe("podiumPages", () => {
  it("makes one page per heading, headed by a title page when the manuscript opens with a point", () => {
    const pages = podiumPages(sermon(body), { passages, books, translationCode: "KJV" });
    expect(pages.map((p) => p.title)).toEqual(["Opening", "The verdict", "For whom", "The Spirit"]);
    expect(pages[0].html).toContain("No &lt;Condemnation&gt;");
    expect(pages[0].html).toContain("Romans 8:1-2");
  });

  it("writes each passage's words in, escaped, with its caption", () => {
    const [, verdict] = podiumPages(sermon(body), { passages, books, translationCode: "KJV" });
    expect(verdict.html).toContain("<sup>1</sup>There is therefore now no condemnation &lt;for&gt; them");
    expect(verdict.html).toContain("Romans 8:1-2 · KJV");
    expect(verdict.html).not.toContain('data-type="passage"');
  });

  it("puts the title on the opening prose when the manuscript starts with prose", () => {
    const pages = podiumPages(sermon("<p>Before any point.</p><h2>One</h2>"), { passages, books });
    expect(pages.map((p) => p.title)).toEqual(["Opening", "One"]);
    expect(pages[0].html).toMatch(/<h1>.*<\/h1>.*Before any point/s);
  });
});

describe("buildPodiumHtml", () => {
  it("is one self-contained page: no external script, style, or font, and nothing from the text can run", () => {
    const html = buildPodiumHtml(
      sermon(body + '<p onclick="alert(1)">x<img src=x onerror="alert(2)"></p><script>alert(3)</script>'),
      { passages, books },
    );
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+href=/);
    expect(html).not.toMatch(/onclick=|onerror=|alert\(\d\)/);
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).toContain("var TARGET_MINUTES = 30;");
    expect(html).toContain('aside data-type="callout" data-kind="application"');
    expect(html).toContain("<title>No &lt;Condemnation&gt;</title>");
  });

  it("shows every section without its script, and leaves the paging to the script", () => {
    const html = buildPodiumHtml(sermon(body), { passages, books });
    // A phone's quick preview runs no script: nothing may start out hidden.
    expect(html).not.toMatch(/<section[^>]* hidden/);
    expect(html).toContain('document.body.classList.add("paged")');
    expect(html).toContain("body.paged .page:not(.current){display:none}");
  });

  it("writes a target of nothing as zero rather than anything the script could misread", () => {
    expect(buildPodiumHtml(sermon(body, { target_minutes: null }), { passages })).toContain("var TARGET_MINUTES = 0;");
  });
});
