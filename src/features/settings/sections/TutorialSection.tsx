import { ChevronDown, Footprints } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Kbd } from "../../../components/ui/Page";
import { openContent } from "../../../workspace/openContent";
import { startTour } from "../../onboarding/tourStore";

interface Category {
  title: string;
  items: { q: string; a: React.ReactNode }[];
}

const CATEGORIES: Category[] = [
  {
    title: "Reading & navigation",
    items: [
      {
        q: "Start the day from Today",
        a: (
          <>
            Today, the first item in the sidebar, gathers where you left off (with the first verse as a teaser), today's reading-plan day with its checkbox, how many memory cards are due, the three people longest unprayed for with a Prayed button, your bookmarks, and the chapters you read most recently. Blocks with nothing in them stay hidden. Settings → Reading → “Open on” makes the app start on Today instead of the Bible; <Kbd>Ctrl</Kbd>+click the sidebar item to keep it open beside the text.
          </>
        ),
      },
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
      {
        q: "Find a word in the chapter",
        a: (
          <>
            Press <Kbd>Ctrl</Kbd>+<Kbd>G</Kbd> (or the find button in the reading toolbar) and type. Every match is marked in the text and the count shows beside the box; <Kbd>Enter</Kbd> and <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> step through them, “Whole word” narrows the match, and <Kbd>Esc</Kbd> closes the bar and clears the marks. Each pane has its own find.
          </>
        ),
      },
      { q: "Read on to the next chapter", a: "A card below the last verse offers the next and previous chapters; click it to keep reading (Ctrl+click opens the chapter in a new pane)." },
      {
        q: "Move between verses with the keyboard",
        a: (
          <>
            With nothing focused, <Kbd>↓</Kbd> and <Kbd>↑</Kbd> (or <Kbd>j</Kbd> and <Kbd>k</Kbd>) select the next or previous verse and keep it in view, so linked commentary and cross-reference panes follow without the mouse. <Kbd>Home</Kbd> and <Kbd>End</Kbd> jump to the first and last verse, and <Kbd>Enter</Kbd> opens the selected verse's menu.
          </>
        ),
      },
      { q: "Change translation", a: "Pick from the translation dropdown in the reading toolbar. “Compare” opens the same chapter in another translation in a pane beside it, linked so both turn pages together; “Interlinear” opens the Hebrew or Greek beneath the English in its own pane." },
      { q: "Text size, spacing, font, and theme", a: <>The Aa button in the reading toolbar. These settings apply to commentary, confessions, and dictionary text too, and can also be changed under Settings → Reading. <Kbd>Ctrl</Kbd>+<Kbd>=</Kbd> and <Kbd>Ctrl</Kbd>+<Kbd>-</Kbd> (or <Kbd>Ctrl</Kbd>+scroll over the text) step the size; <Kbd>Ctrl</Kbd>+<Kbd>0</Kbd> resets it.</> },
      { q: "Use the Windows accent color", a: "Settings → Reading → Accent color → Windows accent gives links, active tabs, and primary buttons the color chosen in Windows Settings → Personalization → Colors, darkened or lightened per theme so it stays readable. App default returns to each theme's own accent." },
      { q: "Accessibility: high contrast, a dyslexia-friendly font, less motion", a: <>The theme list (Aa button or Settings → Reading) includes High contrast and High contrast, dark: pure black and white with strong borders. The font choice includes Dyslexia-friendly, the OpenDyslexic face, whose heavy bottoms keep letters from flipping or swapping. Settings → Reading → Accessibility → Reduce motion turns off transitions and the toast slide; Windows' own reduce-motion setting is honored without it. All three are also commands in the Go to box (<Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>, then <Kbd>&gt;</Kbd>).</> },
      { q: "Paragraph mode, verse numbers, red letters", a: "The sliders button in the reading toolbar holds the view options, including printing the chapter." },
      { q: "Focus mode", a: <>Press <Kbd>F11</Kbd> or click the expand button in the reading toolbar to hide everything but the pane you are in. <Kbd>Esc</Kbd> brings it back.</> },
      { q: "Bookmarks", a: <>The bookmark button in the reading toolbar (or <Kbd>Ctrl</Kbd>+<Kbd>D</Kbd>) marks the chapter or selected verse and lists every bookmark for jumping back.</> },
      {
        q: "Read aloud",
        a: "The speaker button in the reading toolbar reads the chapter with a Windows voice, following along word by word. The player's settings (the speed button in the bar) hold the voice, speed, and highlight choices, plus “Continue into the next chapter”, which turns the page and keeps reading when a chapter ends, and “Stop after”, a sleep timer that fades the voice out over its last ten seconds.",
      },
    ],
  },
  {
    title: "Search",
    items: [
      { q: "Search everything", a: <><Kbd>Ctrl</Kbd>+<Kbd>F</Kbd> or the Search button opens one search across Scripture, commentary, your notes and prayers, your resources, the confessions, your sermons, and your illustrations, each in its own tab. Use the arrow keys and Enter to open a result.</> },
      { q: "Search syntax", a: "Plain words are all required. Use “quoted phrases” for exact phrases, word1 OR word2 for either, and -word to exclude a term." },
      { q: "Narrow a Scripture search", a: "On the Scripture tab, limit results to a testament or a single book with the dropdowns under the tabs." },
      { q: "Save a search", a: "Click Save next to the search box to pin a query so it's always one click away." },
    ],
  },
  {
    title: "Panes",
    items: [
      { q: "Open a study pane", a: <>Click one of the icons on the right edge (Commentary, Cross references, Confessions, Mine, and in the Psalms the Metrical Psalter), or press <Kbd>Ctrl</Kbd>+<Kbd>B</Kbd>. Each opens as a pane beside the text and follows the verse you select.</> },
      { q: "Mine: your notes beside the text", a: "The Mine pane shows everything of yours on the chapter you are reading: notes, chapter notes, and highlights in verse order, with the selected verse's items pinned to the top, then the notes elsewhere that mention this chapter under “Mentioned in”. Each note has Edit and Jump; “New note for v. N” writes a note on the selected verse." },
      { q: "Open anything in a new pane", a: <><Kbd>Ctrl</Kbd>+click (or middle-click) a sidebar item, a reference, a cross reference, a note link, or a search result to open it beside what you are reading instead of replacing it. The preview card that appears when you rest on a reference has a “new pane” button too, and the Go to box (<Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>, then <Kbd>&gt;</Kbd>) lists “Open … in a new pane” for every kind of content.</> },
      { q: "Link groups", a: "Each pane header starts with a small letter: A, B, or C, or a dash for an unlinked pane. Panes in the same group follow each other's passage: click a verse in a group-A Bible and every group-A commentary, cross-reference, and confession pane moves to it, while a Bible pane in group B stays where it is. Click the letter to move a pane between groups. A pane you open from another pane joins that pane's group." },
      { q: "Commands from the keyboard", a: <>Press <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> and type <Kbd>&gt;</Kbd> to list every command: the pane commands (focus, open or change content, link groups, swap, maximize, close, focus mode), layouts and workspaces, and the app's actions: next or previous chapter, bookmark, search, paragraph mode, red letters, verse numbers, highlights and note markers, text size, font and spacing, theme, “Start reading plan”, “New prayer entry”, “Back up now”, and each Settings section. Each shows its shortcut when it has one. Typing part of a command's name without the <Kbd>&gt;</Kbd> offers it alongside references and terms.</> },
      { q: "Work in a pane", a: <>Click anywhere in a pane to focus it; the focused pane has an accent line under its header, and shortcuts, Back and Forward, and the address all act on it. <Kbd>Ctrl</Kbd>+<Kbd>1</Kbd> to <Kbd>Ctrl</Kbd>+<Kbd>4</Kbd> focus panes left to right.</> },
      { q: "Change, move, or close a pane", a: "The ⋯ menu in a pane's header swaps its content for any other page, swaps it with a neighbor, maximizes it, or closes it. Drag a pane's header onto another pane to swap the two. Drag the divider between panes (or between stacked panes) to resize them; widths are remembered. With one pane the app looks as it always has." },
      { q: "Layouts: three and four panes", a: <>The layout button in the top bar (beside the keyboard icon) picks a template: one pane, two columns, two plus one (a reading column with two panes stacked beside it), three columns, or two by two. Choosing a layout with more slots than panes leaves an empty slot with an “Add content” button; more panes than slots become tabs in the last slot. When the window is narrower than 1300px, three- and four-pane layouts show as two columns with the extra panes as tabs on the right. Type <Kbd>&gt;</Kbd> layout in the Go to box to switch by keyboard.</> },
      { q: "Workspaces: save and switch arrangements", a: <>The Workspaces button in the top bar lists three presets (Devotion: the Bible alone; Sermon prep: Bible, Matthew Henry, Confessions, and Mine in a grid; Word study: Bible, Interlinear, and Lexicon) and your own saved ones. “Save current as…” keeps the panes and layout you have open under a name; each saved row has rename and delete buttons. Switching keeps the chapter you are reading in every Bible pane that shares a link group with one in the new arrangement. Saved workspaces are stored with your data, so they survive a reinstall and travel with backups. The workspace you have open always comes back on launch. In the Go to box, <Kbd>&gt;</Kbd> workspace lists them too.</> },
      { q: "Maximize a pane", a: <>Double-click a pane's header (or use the maximize button beside its menu) to give it the whole area; double-click again, or press <Kbd>Esc</Kbd>, to bring the other panes back. <Kbd>F11</Kbd> goes further and hides the sidebar and top bar too.</> },
      { q: "Follow a verse", a: "Click any verse in the text to select it. Cross references and confession proofs follow the selected verse, and the commentary entry that covers it is highlighted. A compare pane in another translation turns pages with you." },
      { q: "Preview a reference", a: <>Rest the pointer on any Scripture reference for a moment (or Tab to it) and a small card shows the passage text with an Open link: cross references, confession proof texts, references inside commentary, notes, dictionary entries, reading plans, and the Harmony. <Kbd>Ctrl</Kbd>+click Open to put it in a new pane. <Kbd>Esc</Kbd> or moving away closes it.</> },
      { q: "Switch commentary source", a: "Use the dropdown at the top of a Commentary pane to pick from every commentary you've installed. The book icon beside it opens that commentary as a book to page through on its own." },
    ],
  },
  {
    title: "Highlights & notes",
    items: [
      { q: "Highlight text", a: "Select any text and a small toolbar appears with highlight colors, underline, note, and copy. A selection across several verses highlights those verses whole." },
      { q: "Act on a whole verse", a: "Right-click a verse, or click its verse number, for a menu: highlight, underline, add a note, copy, compare translations, add it to Scripture memory, or bookmark it." },
      { q: "Copy verses", a: "Copy from the selection toolbar or the verse menu. Settings → Reading → “When copying verses” picks the layout (text only, text then reference, reference then text, or a Markdown quote) and whether the translation code is included." },
      { q: "Add a note", a: "From the selection toolbar or the verse menu. Notes attached to a highlight show a small note icon next to the highlighted text. Chapter-wide notes live behind the note icon in the reading toolbar." },
      { q: "Start a note from a template", a: "While a note is empty, its toolbar offers “Start from…” with headed sections: Observation / Interpretation / Application, Question and answer, Sermon outline, and Prayer response. Rename, reorder, edit, or add templates under Settings → Reading → Note templates." },
      { q: "Name your highlight colors", a: "Each of the five colors has a name (Promise, Command, Doctrine, Prayer, and Warning to start) that shows as the tooltip on its color button. Rename them under Settings → Reading → Highlight colors." },
      { q: "See every highlight", a: <>The Highlights page under My study lists every highlight grouped by color, with its verse text and reference. Filter by color or book; click a reference to jump to it (<Kbd>Ctrl</Kbd>+click opens it in a new pane).</> },
      { q: "Find your notes later", a: "The Notes page lists every note with the verse it was written on, sorted by Bible order or date, searchable and filterable by tag." },
      { q: "Notes that mention a verse", a: "Write “Romans 8:28” in any note and that verse gets a faint dot by its number wherever you read it. A Mine pane (from the Add pane strip) lists those notes under “Mentioned in”." },
      { q: "Get a deleted note back", a: "Deleting a note, chapter note, or prayer entry moves it to the Trash for thirty days: the toast offers Undo at once, and Settings → Data & backups → Trash lists everything waiting there with Restore and Delete permanently. The Notes and Prayer pages show a small Trash link while it holds something of theirs." },
      { q: "Words of Jesus in red", a: "Turn it on from the view options in the reading toolbar or under Settings → Reading. Only his quoted words turn red, not the surrounding verse." },
    ],
  },
  {
    title: "Interlinear & word study",
    items: [
      { q: "Turn on interlinear", a: "Click “Interlinear” in the reading toolbar to open the original Hebrew or Greek beneath each phrase, aligned word by word, in a pane beside the English." },
      { q: "Look up a word while reading", a: "Double-click any word in the Bible text to open its Strong's entry in a popup, without switching to interlinear. The tagging follows the KJV's wording, so it matches best there; when a word can't be matched, the popup offers to search the lexicon for it instead." },
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
      { q: "From the Bible side", a: "A Confessions pane (from the icons on the right edge) shows where the Standards cite the verse you've selected." },
    ],
  },
  {
    title: "Resources (books, audio & video)",
    items: [
      { q: "Add a resource", a: "“Add resource” on the Resources page for one file, or “Import folder” to add every recognized file under a folder at once." },
      { q: "Organize by author", a: "Resources are grouped by author. For a folder import, an Author/Book.epub layout picks the author up from the folder name." },
      { q: "Search inside a book", a: "EPUB, PDF, and MOBI text is indexed. Use the search box at the top of Resources, or the Resources tab in the main search." },
      { q: "Pick up where you left off", a: "EPUBs and PDFs reopen at the place you last read; the position is stored with your data, so it survives a reinstall. An EPUB's chapters are listed under Contents in the reader sidebar (the list icon when the pane is narrow), with the chapter on screen marked." },
      {
        q: "PDF zoom and find",
        a: <>The bar above a PDF page zooms in and out, shows the zoom level (click it to fit the page to the pane's width, the default), and has a Find box for the page you are on: every match is marked on the page, <Kbd>Enter</Kbd> and <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> step through them, and <Kbd>Esc</Kbd> clears. To search a whole book, use the main search instead.</>,
      },
      { q: "Link a resource to a passage", a: "Open a resource and click “Link to current passage”. Linked resources then appear under that chapter's title while reading it." },
    ],
  },
  {
    title: "Prayer",
    items: [
      { q: "Journal entries", a: "“New entry” on the Prayer page. Write in the ACTS pattern (Adoration, Confession, Thanksgiving, Supplication) or as free writing, and attach a passage to keep a promise beside the prayer." },
      { q: "Prayer list", a: "The Prayer list tab keeps people and requests separate from journal entries. “Prayed today” logs it; “Answered” archives it with a note of how God answered." },
      { q: "Who needs prayer most", a: "Anyone not prayed for in fourteen days gets an amber marker with the count; change the number in “Nudge after … days” above the list. The sort “Longest since prayed” puts the most neglected people at the top." },
      { q: "Print the prayer list", a: "The Print button on the Prayer list tab prints the active list grouped by category, with a box beside each name to tick off in a paper journal." },
      { q: "Tags", a: "Add tags to entries and click a tag to filter the list to it." },
    ],
  },
  {
    title: "Memory",
    items: [
      { q: "Add a verse", a: "Type a reference on the Memory page, or right-click any verse while reading and choose “Add to Scripture memory”." },
      { q: "Practice modes", a: "“First letter” shows only the first letter of each word, “Blank word” hides random words, and “Type it” has you type the verse and checks it word for word. Change the mode any time from the verse's row." },
      { q: "Catechism", a: "The Catechism tab memorizes Shorter or Larger Catechism answers with the same tools." },
      { q: "Spaced repetition", a: "Verses come due on a schedule that spaces out as you get them right. “Practice what's due” works through today's cards; the Memory item in the sidebar shows how many are due today." },
      { q: "Practice from the keyboard", a: <>During practice, <Kbd>Space</Kbd> reveals the verse or answer, <Kbd>Enter</Kbd> checks what you typed, <Kbd>1</Kbd> to <Kbd>4</Kbd> grade it (Again, Hard, Good, Easy), and <Kbd>Backspace</Kbd> goes back a card. Each card's “Read in context” link opens the verse in the Bible (or the question in the Confessions).</> },
    ],
  },
  {
    title: "Reading plans & Harmony",
    items: [
      { q: "Start a reading plan", a: "Open a plan on the Reading plans page and start it (or type “start reading plan” in the Go to box). Tick each day as you read; the next unread day is highlighted, and today's reading shows on the Today page with its checkbox." },
      {
        q: "Catch up when you fall behind",
        a: "When the calendar has run ahead of your ticks, the plan page and the Today page say “You're N days behind” with three choices. “Shift my schedule” moves the plan so today becomes the next unread day and nothing is skipped. “Spread over 7 days” keeps your dates but re-spaces the missed days and this week's readings evenly across the coming week, so you are caught up by its end; the Today page then lists every reading due that day. “Skip to today” marks the missed days as read (confirmed first). Every choice offers Undo on its toast. An amber dot on the plan page marks the days the calendar puts today, and each day's date shows as a tooltip.",
      },
      {
        q: "Build your own plan",
        a: "“New plan” on the Reading plans page. “A book in N days” picks books (or a whole testament) and a length and divides the chapters evenly. “From a list” takes one line per day: a book, a chapter, a chapter range like Psalms 1-5, verses like John 3:16-21, or several readings separated by semicolons. Choose the days of the week you read on and the plan's dates skip the others. Your plans sit beside the built-in ones with a Custom mark, track progress and catch up the same way, and can be edited or deleted from their page (deleting asks first).",
      },
      { q: "Harmony of the Gospels", a: "The Harmony page lists the events of Christ's life in order. “Compare” shows the parallel Gospel accounts side by side." },
    ],
  },
  {
    title: "Sermons",
    items: [
      {
        q: "Write the manuscript",
        a: (
          <>
            A sermon is a document, not a note: <Kbd>Ctrl</Kbd>+<Kbd>Alt</Kbd>+<Kbd>1</Kbd> makes a line a point and <Kbd>Ctrl</Kbd>+<Kbd>Alt</Kbd>+<Kbd>2</Kbd> a sub-point, and the toolbar adds quotations, a rule, and underline alongside the usual bold and italic. The points you write are the outline — there is no second place to keep one.
          </>
        ),
      },
      {
        q: "Passages are live, not pasted",
        a: (
          <>
            <Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>P</Kbd> (or the book button) asks for a reference and drops a block that holds it. The words are fetched in the sermon's own translation every time it renders, so changing that translation rewrites every passage in the manuscript at once; red letters, footnotes, and hover previews all work inside a block, and one block's menu can pin it to another translation for a comparison.
          </>
        ),
      },
      {
        q: "Start from a shape",
        a: "An empty manuscript offers “Start from…”: Expository, Textual, Topical, Evangelistic, Funeral, Wedding, and Bible study, each laid out as points and sub-points. Rename, reorder, edit, or add your own under Settings → Reading → Sermon templates.",
      },
      {
        q: "Rehearse it",
        a: "“Rehearse” runs the clock beside the manuscript and, when you finish, offers to log the run with its minutes, its word count, and a note of what it taught (“cut point II”). “Rehearse aloud” reads the manuscript section by section instead, with the same clock going. Every logged run feeds the speaking rate the app quotes your minutes at, and the History list under the manuscript holds them all.",
      },
      {
        q: "Illustrations",
        a: "The Illustrations page keeps stories and quotations apart from any one sermon, with the source each came from and where it has been used. “Save as illustration” beside any selection puts one there; the manuscript toolbar's bulb inserts one as a citation and records the use, warning you when a story has already been told in this series.",
      },
      {
        q: "Preaching mode",
        a: (
          <>
            “Preach” hides everything but the manuscript, at a pulpit size you can change with <Kbd>Ctrl</Kbd>+<Kbd>=</Kbd>. The sermon is paged at its points: <Kbd>Space</Kbd>, <Kbd>PageDown</Kbd>, or <Kbd>→</Kbd> to advance, <Kbd>←</Kbd> to go back, and the screen's left and right thirds work as tap zones. A thin bar shows the time elapsed and what is left against your target, the point you are in, and the one coming. <Kbd>T</Kbd> starts and pauses the clock; <Kbd>Esc</Kbd> leaves and offers to log the run.
          </>
        ),
      },
      {
        q: "Slides, without building any",
        a: (
          <>
            Slides are generated from the manuscript: a title slide, one per point with its sub-points as bullets, one per passage (split when it runs long, so the words never shrink past reading size), and one for each short quotation or illustration. The side panel's Slides tab previews them and starts the show from any of them. “Present the slides” shows them full screen on a dark ground for projection -- <Kbd>→</Kbd>, <Kbd>←</Kbd>, and <Kbd>Esc</Kbd>, with a counter -- and “Export slides as .pptx” writes the same deck for PowerPoint.
          </>
        ),
      },
      {
        q: "What you have already preached here",
        a: "The Mine pane gains a Sermons section on every chapter: the sermons preached from it first, then those that quote it, then those that merely mention it, each opening with a click. The Bible pane's Related row carries the ones preached from the chapter, and a highlight on a verse you later preached from is marked “in a sermon” on the Highlights page.",
      },
      {
        q: "After the sermon",
        a: "“Mark as preached” writes the preaching down — the date, the church, and, if you timed it, how long it took — and the prep track and the status follow it to Preached. The History list holds every rehearsal and preaching with its minutes, and under it a Reflection box waits for what landed, what to cut, and what to say next time. A preached sermon opens with that box ready; the reflection is searchable with the rest of the sermon.",
      },
      {
        q: "A series, and a reading plan for the congregation",
        a: "The Series section at the foot of the Sermons page keeps a preaching calendar: its sermons in order with their texts, dates, and stages, and “6 of 10 preached”. “Make a reading plan” turns the series' texts into a custom reading plan — one reading the day before each sermon, or the text spread over the six days before it — named after the series and dated from the first sermon, so a family can read next Sunday's text during the week. It then behaves like any plan: it shows on Today, it can be started, caught up, and exported. Rebuilding it replaces its days and keeps the ticks that still fit.",
      },
      {
        q: "Print, hand out, export",
        a: "The Print & export menu on a sermon prints the manuscript, the outline, or the fill-in handout (with or without the answer key), and exports the whole sermon as Markdown with every passage's words rendered into the file. Printing to PDF is the print dialog's own choice.",
      },
      {
        q: "Minutes in your own voice",
        a: "From two timed runs on, the app works out your words a minute over the last ten (preachings counted twice) and quotes every sermon's length at that rate, saying so: “about 31 min at your measured 122 wpm”. Settings → Reading → Speaking rate shows what it has measured and the rate it assumes until then.",
      },
      {
        q: "Blanks for the handout",
        a: (
          <>
            Select a word or phrase and press <Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>B</Kbd>: it gets a dotted underline in the manuscript and prints as a rule on the fill-in handout, with an answer key available for the preacher's own copy.
          </>
        ),
      },
    ],
  },
  {
    title: "Settings",
    items: [
      { q: "Library", a: "Settings → Library adds or removes Bible translations and commentaries from XML files." },
      { q: "Back up your data", a: "Settings → Data & backups makes backups on demand, exports or imports the whole database, and can mirror backups to a folder synced by OneDrive or Dropbox. When your newest backup is more than thirty days old (or you have study data and no backup at all), a reminder appears at launch with “Back up now” and “Remind me next week”." },
      { q: "See your study stats", a: "Settings → Data & backups → Stats counts your notes and highlights by book, shows a heatmap of the days you read over the past year (darker squares mean more chapters), and totals the chapters read, prayers logged, and verses and catechism answers memorized." },
      { q: "Keyboard shortcuts", a: <>Press <Kbd>Ctrl</Kbd>+<Kbd>/</Kbd> at any time for the full list.</> },
      { q: "Take the tour again", a: <>The first launch walks through three things in place: the Go to button, a verse number, and the Add pane strip. “Show the tour again” at the top of this page replays it; inside it, <Kbd>→</Kbd> and <Kbd>←</Kbd> step and <Kbd>Esc</Kbd> skips.</> },
    ],
  },
];

export function TutorialSection() {
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-ink">Tutorial</h2>
      <p className="mb-4 text-sm text-ink-3">Everything this app can do, organized by area. Expand a section to see how.</p>
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium text-ink">The three-step tour</div>
          <div className="text-xs text-ink-3">Opens the Bible and points out the Go to button, a verse number, and the Add pane strip.</div>
        </div>
        <Button
          icon={Footprints}
          onClick={() => {
            // The tour spotlights the Bible page, so this pane shows it
            // first (Back returns to Settings).
            openContent("bible", {}, { target: "focused" });
            window.setTimeout(startTour, 350);
          }}
        >
          Show the tour again
        </Button>
      </div>
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
