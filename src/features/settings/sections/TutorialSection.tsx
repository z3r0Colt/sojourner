import { ChevronDown } from "lucide-react";
import { Kbd } from "../../../components/ui/Page";

interface Category {
  title: string;
  items: { q: string; a: React.ReactNode }[];
}

const CATEGORIES: Category[] = [
  {
    title: "Reading & navigation",
    items: [
      {
        q: "Jump to a passage",
        a: (
          <>
            Press <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> anywhere, or click “Go to” at the top, and type a reference like “John 3:16” or “Rom 8”. With nothing typed it lists the passages you read most recently.
          </>
        ),
      },
      {
        q: "Move a chapter at a time",
        a: (
          <>
            Use the book and chapter pickers in the reading toolbar, the arrows beside them, or <Kbd>Ctrl</Kbd>+<Kbd>[</Kbd> and <Kbd>Ctrl</Kbd>+<Kbd>]</Kbd>.
          </>
        ),
      },
      {
        q: "Go back to where you were",
        a: (
          <>
            <Kbd>Alt</Kbd>+<Kbd>←</Kbd> and <Kbd>Alt</Kbd>+<Kbd>→</Kbd>, or the arrows at the top left, step through your reading history like a browser.
          </>
        ),
      },
      { q: "Change translation", a: "Pick from the translation dropdown in the reading toolbar. “Parallel” shows the chapter side by side in several translations at once; “Interlinear” shows the Hebrew or Greek beneath the English." },
      { q: "Text size, spacing, font, and theme", a: "The Aa button in the reading toolbar. These settings apply to commentary, confessions, and dictionary text too, and can also be changed under Settings → Reading." },
      { q: "Paragraph mode, verse numbers, red letters", a: "The sliders button in the reading toolbar holds the view options, including printing the chapter." },
      { q: "Focus mode", a: <>Press <Kbd>F11</Kbd> or click the expand button in the reading toolbar to hide everything but the text. <Kbd>Esc</Kbd> brings it back.</> },
      { q: "Bookmarks", a: <>The bookmark button in the reading toolbar (or <Kbd>Ctrl</Kbd>+<Kbd>D</Kbd>) marks the chapter or selected verse and lists every bookmark for jumping back.</> },
    ],
  },
  {
    title: "Search",
    items: [
      { q: "Search everything", a: <><Kbd>Ctrl</Kbd>+<Kbd>F</Kbd> or the Search button opens one search across Scripture, commentary, your notes and prayers, your resources, and the confessions, each in its own tab. Use the arrow keys and Enter to open a result.</> },
      { q: "Search syntax", a: "Plain words are all required. Use “quoted phrases” for exact phrases, word1 OR word2 for either, and -word to exclude a term." },
      { q: "Narrow a Scripture search", a: "On the Scripture tab, limit results to a testament or a single book with the dropdowns under the tabs." },
      { q: "Save a search", a: "Click Save next to the search box to pin a query so it's always one click away." },
    ],
  },
  {
    title: "Study panel",
    items: [
      { q: "Open it", a: <>Click one of the icons on the right edge of the reading view, or press <Kbd>Ctrl</Kbd>+<Kbd>B</Kbd>. It has tabs for Commentary, Cross references, Confessions, and (in the Psalms) the Metrical Psalter.</> },
      { q: "Follow a verse", a: "Click any verse in the text to select it. Cross references and confession proofs follow the selected verse, and the commentary entry that covers it is highlighted." },
      { q: "Preview a reference", a: <>Rest the pointer on a cross reference for a moment (or Tab to it) and a small card shows the passage text with an Open link. <Kbd>Esc</Kbd> or moving away closes it.</> },
      { q: "Move, resize, or collapse it", a: "Drag its inner edge to resize, use the arrow button to dock it on the other side, or collapse it back to the icon strip." },
      { q: "Switch commentary source", a: "Use the dropdown at the top of the Commentary tab to pick from every commentary you've installed. The book icon beside it opens that commentary as a book to page through on its own." },
    ],
  },
  {
    title: "Highlights & notes",
    items: [
      { q: "Highlight text", a: "Select any text and a small toolbar appears with highlight colors, underline, note, and copy. A selection across several verses highlights those verses whole." },
      { q: "Act on a whole verse", a: "Right-click a verse, or click its verse number, for a menu: highlight, underline, add a note, copy with the reference, compare translations, add it to Scripture memory, or bookmark it." },
      { q: "Add a note", a: "From the selection toolbar or the verse menu. Notes attached to a highlight show a small note icon next to the highlighted text. Chapter-wide notes live behind the note icon in the reading toolbar." },
      { q: "Find your notes later", a: "The Notes page lists every note with the verse it was written on, sorted by Bible order or date, searchable and filterable by tag." },
      { q: "Words of Jesus in red", a: "Turn it on from the view options in the reading toolbar or under Settings → Reading. Only his quoted words turn red, not the surrounding verse." },
    ],
  },
  {
    title: "Interlinear & word study",
    items: [
      { q: "Turn on interlinear", a: "Click “Interlinear” in the reading toolbar to show the original Hebrew or Greek beneath each phrase, aligned word by word." },
      { q: "Look up a Strong's number", a: "Click any tagged word in interlinear view to see its lexicon entry in a popup. “View full entry” opens the Lexicon page with a concordance of every verse using that word." },
      { q: "Lexicon page", a: "Search by English meaning, transliteration, or Strong's number (H1, G25). Thayer's fuller Greek definitions appear when available." },
      { q: "Dictionary", a: "Encyclopedia-style entries for people, places, and topics, browsable by letter and searchable. Scripture references inside an entry are clickable." },
    ],
  },
  {
    title: "Confessions",
    items: [
      { q: "Browse the Westminster Standards", a: "The Confessions page holds the Westminster Confession and the Larger and Shorter Catechisms. Pick a document, then a chapter or question, or browse by doctrinal topic." },
      { q: "Proof texts", a: "Each section's Scripture proofs are numbered in the text and listed beneath it; each one jumps to the passage." },
      { q: "From the Bible side", a: "The Confessions tab in the study panel shows where the Standards cite the verse you've selected." },
    ],
  },
  {
    title: "Resources (books, audio & video)",
    items: [
      { q: "Add a resource", a: "“Add resource” on the Resources page for one file, or “Import folder” to add every recognized file under a folder at once." },
      { q: "Organize by author", a: "Resources are grouped by author. For a folder import, an Author/Book.epub layout picks the author up from the folder name." },
      { q: "Search inside a book", a: "EPUB, PDF, and MOBI text is indexed. Use the search box at the top of Resources, or the Resources tab in the main search." },
      { q: "Link a resource to a passage", a: "Open a resource and click “Link to current passage”. Linked resources then appear under that chapter's title while reading it." },
    ],
  },
  {
    title: "Prayer",
    items: [
      { q: "Journal entries", a: "“New entry” on the Prayer page. Write in the ACTS pattern (Adoration, Confession, Thanksgiving, Supplication) or as free writing, and attach a passage to keep a promise beside the prayer." },
      { q: "Prayer list", a: "The Prayer list tab keeps people and requests separate from journal entries. “Prayed today” logs it; “Answered” archives it with a note of how God answered." },
      { q: "Tags", a: "Add tags to entries and click a tag to filter the list to it." },
    ],
  },
  {
    title: "Memory",
    items: [
      { q: "Add a verse", a: "Type a reference on the Memory page, or right-click any verse while reading and choose “Add to Scripture memory”." },
      { q: "Practice modes", a: "“First letter” shows only the first letter of each word, “Blank word” hides random words, and “Type it” has you type the verse and checks it word for word. Change the mode any time from the verse's row." },
      { q: "Catechism", a: "The Catechism tab memorizes Shorter or Larger Catechism answers with the same tools." },
      { q: "Spaced repetition", a: "Verses come due on a schedule that spaces out as you get them right. “Practice what's due” works through today's cards." },
    ],
  },
  {
    title: "Reading plans & Harmony",
    items: [
      { q: "Start a reading plan", a: "Open a plan on the Reading plans page and start it. Tick each day as you read; today's day is highlighted." },
      { q: "Harmony of the Gospels", a: "The Harmony page lists the events of Christ's life in order. “Compare” shows the parallel Gospel accounts side by side." },
    ],
  },
  {
    title: "Settings",
    items: [
      { q: "Library", a: "Settings → Library adds or removes Bible translations and commentaries from XML files." },
      { q: "Back up your data", a: "Settings → Data & backups makes backups on demand, exports or imports the whole database, and can mirror backups to a folder synced by OneDrive or Dropbox." },
      { q: "Keyboard shortcuts", a: <>Press <Kbd>Ctrl</Kbd>+<Kbd>/</Kbd> at any time for the full list.</> },
    ],
  },
];

export function TutorialSection() {
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-ink">Tutorial</h2>
      <p className="mb-4 text-sm text-ink-3">Everything this app can do, organized by area. Expand a section to see how.</p>
      <div className="space-y-2">
        {CATEGORIES.map((cat) => (
          <details key={cat.title} className="group rounded-lg border border-line bg-surface">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-ink hover:bg-hover">
              <ChevronDown className="h-4 w-4 -rotate-90 text-ink-3 transition-transform group-open:rotate-0" aria-hidden="true" />
              {cat.title}
            </summary>
            <dl className="space-y-3 border-t border-line px-4 py-3">
              {cat.items.map((item) => (
                <div key={item.q}>
                  <dt className="text-sm font-medium text-ink">{item.q}</dt>
                  <dd className="mt-0.5 text-sm text-ink-2">{item.a}</dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
      </div>
    </div>
  );
}
