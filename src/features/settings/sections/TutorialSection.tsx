interface Category {
  title: string;
  items: { q: string; a: string }[];
}

const CATEGORIES: Category[] = [
  {
    title: "Reading & Navigation",
    items: [
      { q: "Jump to a passage", a: 'Press Ctrl+K (⌘K) anywhere, or click "Go to…" in the header, and type a reference like "John 3:16" or "Rom 8".' },
      { q: "Move a chapter at a time", a: "Use the chapter dropdowns in the header, or the ← / → arrows next to them." },
      { q: "Go back to where you were", a: "Alt+Left / Alt+Right (or the ← → history buttons in the header) step through your recent reading history, like a browser." },
      { q: "Change translation", a: "Pick from the translation dropdown in the header. Open \"Parallel\" to show one or more additional translations side by side with the primary one." },
      { q: "Paragraph mode", a: "Settings → Preferences → \"Paragraph mode\" flows the chapter as continuous prose instead of one verse per line." },
      { q: "Distraction-free mode", a: "Hides all chrome (header, panels) down to just the text. Toggle it from the reading view's view menu." },
      { q: "Print a chapter", a: "The Print button in the reading view prints only the chapter text -- no navigation or side panels." },
    ],
  },
  {
    title: "Search",
    items: [
      { q: "Search everything", a: "Ctrl+F (⌘F) or the Search button opens a combined search across Scripture, commentary, your notes, resources, and the Westminster Standards, each in its own tab." },
      { q: "Search syntax", a: 'Plain words are AND-ed together. Use "quoted phrases" for exact phrases, word1 OR word2 for either, and -word or NOT word to exclude a term.' },
      { q: "Narrow a Scripture search", a: "While on the Scripture tab, restrict to a testament or a single book with the dropdowns next to the tab." },
      { q: "Save a search", a: "Click the ☆ Save button next to the search box to pin a query so it's always one click away." },
    ],
  },
  {
    title: "Interlinear & Word Study",
    items: [
      { q: "Turn on interlinear", a: "Click \"Interlinear\" in the header to show the original Hebrew or Greek beneath each verse, aligned word-for-word." },
      { q: "Look up a Strong's number", a: "Click any underlined word (in interlinear view, or a Strong's-tagged word in the regular text) to open its lexicon entry in a popup." },
      { q: "Full lexicon entry & concordance", a: 'Click "View full entry →" in the popup, or visit Lexicon in Settings-adjacent navigation, to see every other verse using that same original word.' },
      { q: "Thayer's definitions", a: "When available for a Greek word, Thayer's fuller definition appears beneath the Strong's gloss in both the popup and the full lexicon entry." },
      { q: "Dictionary", a: "The Dictionary section has encyclopedia-style entries for people, places, and topics -- searchable and cross-linked from commentary text." },
    ],
  },
  {
    title: "Highlights, Notes & Commentary",
    items: [
      { q: "Highlight text", a: "Select any verse text; a small toolbar appears letting you pick a highlight color or underline style." },
      { q: "Add a note", a: "From the same selection toolbar, choose the note icon to attach a note to that verse range. Chapter-level notes (not tied to a specific verse) are available from the chapter menu." },
      { q: "Open the study panel", a: 'Click "Study" (or the ‹ tab on the right edge) to open the side panel with Commentary and Cross References tabs.' },
      { q: "Move, resize, or collapse the study panel", a: "Drag its left edge to resize, click the ⇤/⇥ button to dock it to the other side of the screen, or click ‹/› to collapse it to a thin rail." },
      { q: "Switch commentary source", a: "Use the dropdown at the top of the Commentary tab to pick from every commentary you've installed (Matthew Henry, JFB, Spurgeon's Treasury of David, etc.)." },
      { q: "Read a commentary straight through", a: '"Read as book" in the Commentary tab opens that source as its own book you can page through independent of your current chapter.' },
      { q: "Red-letter mode", a: "Settings → Preferences → \"Red-letter\" highlights only Jesus's own quoted words in red, not the surrounding verse." },
    ],
  },
  {
    title: "Resources (books, audio & video)",
    items: [
      { q: "Add a resource", a: '"Add Resource…" on the Resources page for one file at a time, or "Import Folder…" to recursively add every recognized file under a folder at once.' },
      { q: "Organize by author", a: 'Resources are grouped by author automatically -- for bulk imports, put files in an "Author/Book.epub" folder layout so the author is picked up from the folder name.' },
      { q: "Search inside a book", a: "Text-bearing resources (EPUB, PDF, MOBI) are deep-indexed -- use the search box at the top of Resources, or the Resources tab in the main search, to search their full text." },
      { q: "Remove a resource", a: "Click the ⋮ menu next to a resource and choose Remove." },
      { q: "Link a resource to a passage", a: "Open a resource and use its link option to attach it to a specific chapter -- linked resources then show up while reading that chapter." },
    ],
  },
  {
    title: "Sermon Notes",
    items: [
      { q: "Create a sermon note", a: '"+ New Sermon Note" on the Sermons page. Record the preacher, date, and outline, and attach one or more Scripture passages.' },
      { q: "Group notes into a series", a: "Set a series name on a note (e.g. \"Romans: Justified by Faith\") to group it with other notes in that series; notes are also automatically grouped by the book(s) they're linked to." },
      { q: "Tag doctrine/topics", a: "Add free-text doctrine tags to a note (e.g. \"justification\", \"covenant\") -- click a tag anywhere to see every note sharing it, and tags are searchable from the Sermons search box." },
      { q: "Link a confession section", a: "Attach a Westminster Standards (or other confession) section to a note to tie the sermon back to its doctrinal statement." },
      { q: "Link a word study", a: "Attach a Strong's-tagged word to a note with your own observation -- it links straight back into the interlinear for that word." },
      { q: "Jump to the passage from a note", a: "Click any passage chip on a sermon note to open that passage in the reading view." },
      { q: "Search your sermon notes", a: "The search box at the top of the Sermons page searches title, preacher, passage, outline, tags, and application text together." },
    ],
  },
  {
    title: "Prayer Journal & Prayer List",
    items: [
      { q: "Add an entry", a: '"+ New Entry" on the Prayer page. Fill in whichever sections apply -- entries only show the sections you actually wrote.' },
      { q: "ACTS or free writing", a: "Toggle an entry between the ACTS format (Adoration, Confession, Thanksgiving, Supplication) and a single free-writing box, whichever suits that entry." },
      { q: "Link a verse", a: "Attach a passage to a prayer entry to keep a Scripture prompt or promise alongside it -- click the reference chip later to jump back to it." },
      { q: "Keep a prayer list", a: "The Prayer List tab tracks people (or requests) to pray for separately from your journal entries -- add a person with a category and notes, tap \"Prayed today\" to log it, and \"Mark answered\" to archive it once God answers." },
      { q: "Search prayers", a: "The search box searches across all of an entry's written content." },
    ],
  },
  {
    title: "Scripture Memory",
    items: [
      { q: "Add a verse to memorize", a: 'Type a reference (e.g. "Philippians 4:6-7") on the Memory page and pick a practice mode.' },
      { q: "Practice modes", a: '"First letter" shows only the first letter of each word as a hint; "Blank word" hides random whole words; "Type it" has you type the verse from memory and checks it word-for-word. Change a verse\'s mode any time from its row.' },
      { q: "Streaks & stats", a: "Each verse tracks a practice streak, and the Memory page shows overall stats so you can see progress at a glance." },
      { q: "Spaced repetition", a: 'Verses come "due" for review on a schedule that spaces out as you get them right. Click "Practice" to work through everything due today.' },
    ],
  },
  {
    title: "Reading Plans & Harmony",
    items: [
      { q: "Start a reading plan", a: "Browse available plans on the Plans page and start one -- it tracks your daily reading and completion automatically." },
      { q: "Harmony of the Gospels", a: "The Harmony page lines up parallel Gospel accounts of the same events side by side." },
    ],
  },
  {
    title: "Confessions & Creeds",
    items: [
      { q: "Browse the Westminster Standards", a: "The Confessions page holds the Westminster Confession, Catechisms, and other Reformed confessions and creeds, organized by section." },
      { q: "Proof texts", a: "Each section's supporting Scripture proofs are listed alongside it and link back to the reading view." },
      { q: "Search confessions", a: "The Westminster tab in the main search (Ctrl+F) searches across every confession installed." },
    ],
  },
  {
    title: "Settings",
    items: [
      { q: "Manage your library", a: "Settings → Library adds or removes Bible translations and commentaries (drop in XML files, or use Rescan Import Folders)." },
      { q: "Reading preferences", a: "Settings → Preferences controls theme (including a true-black OLED option), font size, verse numbers, highlights, note symbols, morphology codes, red-letter mode, and paragraph mode." },
      { q: "Back up your data", a: "Settings → Data & Backups makes on-demand backups, exports/imports the full database, and can mirror backups to a synced folder (Dropbox, OneDrive, iCloud Drive) to carry your data to another install." },
    ],
  },
];

export function TutorialSection() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Tutorial</h1>
      <p className="mb-4 text-sm text-gray-500">Everything this app can do, organized by area. Expand a section to see how.</p>
      <div className="space-y-2">
        {CATEGORIES.map((cat) => (
          <details key={cat.title} className="group rounded border border-gray-200 dark:border-gray-800">
            <summary className="cursor-pointer list-none rounded px-3 py-2 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-900">
              <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">›</span>
              {cat.title}
            </summary>
            <dl className="space-y-3 border-t border-gray-200 px-3 py-3 dark:border-gray-800">
              {cat.items.map((item) => (
                <div key={item.q}>
                  <dt className="text-sm font-medium">{item.q}</dt>
                  <dd className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">{item.a}</dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
      </div>
    </div>
  );
}
