/**
 * The written tutorial: every feature, as one sentence saying what it is,
 * numbered steps naming the controls as the app labels them, and links
 * that open the place being described beside the tutorial.
 *
 * Plain data, so it can be tested: `tutorialContent.test.ts` checks that
 * every link route parses and that every keyboard chord in
 * `layout/shortcuts.ts` is explained here. Keys are written in square
 * brackets -- `[Ctrl]+[K]` -- and rendered as key caps by TutorialSection.
 *
 * Keep it factual. Say what a control is called, where it is, and what
 * happens. When a feature changes, its entry changes the same day.
 */

/** A page or section to open beside the tutorial (a route `parseRoute`
 * knows), a Bible reference, or a button in the top bar to press. */
export type TutorialLink =
  | { label: string; to: string }
  | { label: string; passage: { bookId: number; chapter: number; verse?: number } }
  | { label: string; press: "goto" | "search" | "shortcuts" | "layout" | "workspaces" | "add-pane" }
  | { label: string; tour: true };

export interface TutorialEntry {
  /** Stable, for the URL and the search. */
  id: string;
  title: string;
  /** One sentence: what this is. */
  what: string;
  /** Numbered steps; the first names where to start. */
  steps: string[];
  links?: TutorialLink[];
}

export interface TutorialCategory {
  title: string;
  entries: TutorialEntry[];
}

export const TUTORIAL: TutorialCategory[] = [
  {
    title: "Getting around",
    entries: [
      {
        id: "sidebar",
        title: "The sidebar",
        what: "The sidebar on the left lists every page in four groups: Scripture, Library (works others wrote), Notebook (what you write), and Devotion (daily practice), with Today above them and Settings below.",
        steps: [
          "Click a page to open it in the pane you are working in.",
          "[Ctrl]+click (or middle-click) a page to open it in a new pane beside what you have.",
          "Click Collapse at the bottom to shrink the sidebar to icons; click the same button to bring the labels back.",
        ],
        links: [
          { label: "Today", to: "/today" },
          { label: "Bible", to: "/" },
        ],
      },
      {
        id: "today",
        title: "Start the day from Today",
        what: "Today is one page over everything: seven blocks in a fixed order, and any block with nothing to show stays hidden.",
        steps: [
          "Click Today, the first item in the sidebar.",
          "Continue reading shows where you left off, with the first verse as a teaser; click it to carry on.",
          "Today's plan lists the day's reading-plan readings with a checkbox each.",
          "This Sunday shows the sermon coming up, its prep stage, and how much of it is written.",
          "Due for review counts the memory cards waiting today.",
          "Pray for names the three people longest unprayed for, each with a Prayed button.",
          "Bookmarks and Recent chapters list what you marked and what you read last.",
          "To open on Today at every launch: Settings → Reading → Open on → Today.",
        ],
        links: [
          { label: "Today", to: "/today" },
          { label: "Settings → Reading", to: "/settings?section=preferences" },
        ],
      },
      {
        id: "goto",
        title: "Jump to a passage",
        what: "The Go to box takes a reference, a Strong's number, or a word and opens it.",
        steps: [
          "Press [Ctrl]+[K], or click Go to in the top bar.",
          "Type a reference such as John 3:16 or Rom 8, and press [Enter].",
          "With nothing typed, the list shows the passages you read most recently.",
          "Type a Strong's number such as G26 or H430 to open the lexicon entry, or a word to search the lexicon and dictionary for it.",
        ],
        links: [{ label: "Open the Go to box", press: "goto" }],
      },
      {
        id: "commands",
        title: "Run any command from the keyboard",
        what: "Every action in the app is a command in the Go to box, each showing its shortcut when it has one.",
        steps: [
          "Press [Ctrl]+[K]+[>], that is, open Go to and type > first.",
          "Type part of the command's name: next chapter, paragraph mode, bookmark, search, start reading plan, new prayer entry, new sermon, back up now, a Settings section, a layout, a workspace, or a pane command.",
          "Press [Enter] to run it.",
          "Typing part of a command's name without the > offers it alongside references and terms.",
        ],
        links: [{ label: "Open the Go to box", press: "goto" }],
      },
      {
        id: "search",
        title: "Search everything",
        what: "One search box looks across Scripture, commentary, your notes, prayers, resources, the confessions, the encyclopedia, your sermons, and your illustrations, each on its own tab.",
        steps: [
          "Press [Ctrl]+[F], or click Search in the top bar.",
          "Type your words. Plain words are all required; put a phrase in \"quotes\" for an exact phrase; write word1 OR word2 for either; write -word or -\"a phrase\" to leave it out; group with (parentheses).",
          "More operators: love ~5 God finds the two within five words; +love finds that form only, not loved; +LORD matches the capitals too; lov* finds any word beginning so; /pattern/ is a regular expression over one translation. Click the ? beside the box for the full list, each with an example to try.",
          "Filters can be typed in the box, so a saved search keeps them: in:psalms, in:rom8, in:nt, in:gospels; t:kjv,geneva for translations; c:henry for a commentary; G26 or H2617 for every verse with that Strong's number; red: for the words of Christ; has:note, has:highlight or color:yellow for your own marks; since:2026-01 for notes and prayers.",
          "Type a reference such as Jn 3:16 and the first row goes there. Romans 8 love searches Romans 8 for love.",
          "The line under the box says how the search was read. Suggestions appear as you type; [Tab] takes the first.",
          "Switch tabs across the top to see each kind of result with its count. All blends them, Scripture first.",
          "On the Scripture tab, choose which translation to search: the one you are reading, all of them, or any one. The Commentary tab chooses a commentary the same way. The testament and book lists write in: into the box.",
          "Tick Whole words to stop son from finding song. With an older translation, Older spellings also finds shew for show and the -eth endings.",
          "Counts by book and translation run down the side; click one to narrow to it. The concordance button lines every hit up on its matched word.",
          "The copy button copies the results as a list of references or with their text, or sends them all to the open sermon.",
          "When nothing matches, the search suggests the nearest words the translations use.",
          "Use [↓] and [↑] to move through results and [Enter] to open one; [Ctrl]+click opens in a new pane.",
          "Click Save beside the box to keep a query one click away. The dock button moves the search into a pane beside the reading, where it stays while you open result after result.",
        ],
        links: [{ label: "Open Search", press: "search" }],
      },
      {
        id: "shortcuts",
        title: "Keyboard shortcuts",
        what: "The shortcut sheet lists every key the app answers to, grouped by where it applies.",
        steps: ["Press [Ctrl]+[/] at any time, or click the keyboard icon at the right of the top bar.", "Press [Esc] to close it."],
        links: [{ label: "Open the shortcuts", press: "shortcuts" }],
      },
      {
        id: "history",
        title: "Go back to where you were",
        what: "Each pane keeps its own history, like a browser tab.",
        steps: ["Press [Alt]+[←] to go back and [Alt]+[→] to go forward in the pane you are working in.", "The arrows at the top left of the window do the same."],
      },
    ],
  },
  {
    title: "Reading the Bible",
    entries: [
      {
        id: "chapter-nav",
        title: "Move a chapter at a time",
        what: "The reading toolbar above the text picks the book and chapter.",
        steps: [
          "Use the book and chapter dropdowns in the reading toolbar, or the arrows beside them.",
          "Press [Ctrl]+[[] for the previous chapter and [Ctrl]+[]] for the next.",
          "At the end of a chapter, a card offers the next and previous chapters; click it to keep reading ([Ctrl]+click opens it in a new pane).",
        ],
        links: [{ label: "Bible", to: "/" }],
      },
      {
        id: "select-verse",
        title: "Select a verse; linked panes follow",
        what: "Selecting a verse tells every linked study pane which verse to show.",
        steps: [
          "Click anywhere on a verse to select it. Cross references, confession proofs, and the encyclopedia move to it, and the commentary entry that covers it is highlighted.",
          "With nothing focused, press [↓] or [↑] (or j and k) to select the next or previous verse; the pane scrolls to keep it in view.",
          "Press [Home] to select the first verse and End the last.",
          "Press [Enter] to open the selected verse's menu.",
          "A second Bible pane in the same link group scrolls to the selected verse too.",
        ],
        links: [{ label: "Bible", to: "/" }],
      },
      {
        id: "verse-menu",
        title: "Act on a whole verse",
        what: "The verse menu holds everything that acts on one verse.",
        steps: [
          "Right-click a verse, click its verse number, or select it and press [Enter].",
          "Choose highlight, underline, add a note, copy, compare translations, add to Scripture memory, or bookmark.",
        ],
      },
      {
        id: "highlight-text",
        title: "Highlight or underline a span",
        what: "Any selected text can be highlighted in one of five named colors or underlined.",
        steps: [
          "Select text with the mouse. A small toolbar appears above the selection.",
          "Click a color, the underline, the note icon, or copy. A selection across several verses highlights those verses whole.",
          "Rest the pointer on a color button to see its name (Promise, Command, Doctrine, Prayer, and Warning to start). Rename them under Settings → Reading → Highlight colors.",
          "The Highlights page lists every highlight grouped by color, with its text and reference. Filter by color or book; click a reference to jump to it.",
        ],
        links: [
          { label: "Highlights", to: "/highlights" },
          { label: "Settings → Reading", to: "/settings?section=preferences" },
        ],
      },
      {
        id: "compare",
        title: "Compare translations",
        what: "Compare opens the same chapter in another translation in a linked pane, so both turn pages together.",
        steps: [
          "Click Compare in the reading toolbar and pick a translation.",
          "The new pane opens beside the text, in the same link group, and follows chapter and verse.",
          "To compare one verse in every translation at once, choose Compare from the verse's menu.",
          "In the New Testament, the Compare window can also set the Greek editions side by side: choose Greek editions: differences. Words an edition reads differently are marked; click one to see that place in every edition. It compares printed editions, not manuscripts.",
        ],
        links: [{ label: "Bible", to: "/" }],
      },
      {
        id: "translations",
        title: "Change translation, and add your own",
        what: "Historic and modern English translations, the Hebrew and Greek texts, the Septuagint and the Vulgate ship with the app; a copyrighted translation can be added from your own file.",
        steps: [
          "Pick a translation from the dropdown in the reading toolbar. Each Bible pane keeps its own choice. The list is grouped: Historic English, Modern English, and Greek, Hebrew and Latin.",
          "The Hebrew Old Testament (WLC) reads right to left. The Greek New Testament comes in five editions: the Textus Receptus behind the KJV, the Byzantine text, the SBL Greek New Testament, Westcott–Hort and Tregelles. All of them follow English chapter and verse numbering, so they line up with the English beside them.",
          "Double-click a Greek or Hebrew word for its Strong's entry. Search finds Greek and Hebrew typed without accents or vowel points.",
          "To add a translation you own (NASB, NKJV, NLT, and the like are not bundled: they are in copyright), go to Settings → Library and click Add file. Zefania XML is detected automatically.",
          "The Library page marks such a translation as imported on this computer; sharing it is your own arrangement with its publisher.",
          "Click Rescan import folders after copying files into the imports folder by hand.",
        ],
        links: [{ label: "Settings → Library", to: "/settings?section=library" }],
      },
      {
        id: "text-size",
        title: "Text size, spacing, font, and theme",
        what: "One set of reading preferences applies to the Bible, commentary, confessions, and dictionary text.",
        steps: [
          "Click the Aa button in the reading toolbar, or open Settings → Reading.",
          "Press [Ctrl]+[=] for larger text and [Ctrl]+[-] for smaller, two pixels at a time; [Ctrl]+[0] resets to 18px. [Ctrl]+scroll over the text does the same.",
          "Theme offers Match Windows, Light, Sepia, Dark, True black (OLED), High contrast, and High contrast, dark.",
          "Accent color → Windows accent uses the color from Windows Settings → Personalization → Colors, adjusted per theme to stay readable.",
        ],
        links: [{ label: "Settings → Reading", to: "/settings?section=preferences" }],
      },
      {
        id: "accessibility",
        title: "Accessibility",
        what: "High contrast themes, a dyslexia-friendly font, and reduced motion.",
        steps: [
          "Theme: choose High contrast or High contrast, dark for pure black and white with strong borders.",
          "Font: choose Dyslexia-friendly (the OpenDyslexic face) under Font.",
          "Settings → Reading → Accessibility → Reduce motion turns off transitions and the toast slide. Windows' own reduce-motion setting is honored without it.",
          "All three are also commands in the Go to box.",
        ],
        links: [{ label: "Settings → Reading", to: "/settings?section=preferences" }],
      },
      {
        id: "view-options",
        title: "Paragraph mode, verse numbers, red letters",
        what: "How the chapter is laid out, per pane.",
        steps: [
          "Click the sliders button in the reading toolbar.",
          "Paragraph mode runs verses together as prose; Show verse numbers and Words of Jesus in red are switches. Only his quoted words turn red.",
          "The same menu prints the chapter.",
          "Settings → Reading → Bible text holds the defaults, plus Show highlights, Show note markers, and Show grammar codes in interlinear view.",
        ],
        links: [{ label: "Settings → Reading", to: "/settings?section=preferences" }],
      },
      {
        id: "find",
        title: "Find a word in the chapter",
        what: "Each pane has its own find bar for the chapter it shows.",
        steps: [
          "Press [Ctrl]+[G], or click the find button in the reading toolbar, and type.",
          "Every match is marked and counted; [Enter] and [Shift]+[Enter] step through them.",
          "Tick Whole word to narrow the match.",
          "Press [Esc] to close the bar and clear the marks.",
        ],
      },
      {
        id: "focus-mode",
        title: "Focus mode",
        what: "Focus mode hides everything but the pane you are in.",
        steps: ["Press [F11], or click the expand button in the reading toolbar.", "Press [Esc] to bring the sidebar and top bar back."],
      },
      {
        id: "bookmarks",
        title: "Bookmarks",
        what: "A bookmark marks a chapter or a selected verse for jumping back.",
        steps: ["Press [Ctrl]+[D], or click the bookmark button in the reading toolbar, to add or remove one.", "Click the same button to list every bookmark; click one to go there. Today lists them too."],
        links: [{ label: "Today", to: "/today" }],
      },
      {
        id: "preview",
        title: "Preview a reference",
        what: "Resting on any Scripture reference shows the passage in a small card.",
        steps: [
          "Hover a reference (or Tab to it) in cross references, confession proofs, commentary, notes, dictionary entries, reading plans, or the Harmony.",
          "Click Open in the card to go there; [Ctrl]+click Open to put it in a new pane.",
          "Press [Esc] or move away to close it.",
        ],
      },
      {
        id: "read-aloud",
        title: "Read aloud",
        what: "The app reads a chapter, a commentary entry, or a book with a neural voice that ships with it, following along as it reads.",
        steps: [
          "Click the speaker button in the reading toolbar (or the Read aloud button on a commentary or book).",
          "The player bar appears at the bottom of the window with play, pause, next, and previous.",
          "Click the speed button in the bar for the settings: Engine (the bundled neural voice, or the voices installed in Windows), Voice, Speed, Pitch, and how the current word is highlighted.",
          "Continue into the next chapter turns the page and keeps reading; Stop after is a sleep timer that fades the voice out over its last ten seconds.",
          "Click a verse while it reads to move the voice to that verse.",
        ],
        links: [{ label: "Bible", to: "/" }],
      },
      {
        id: "pronunciation",
        title: "Correct how a name is said",
        what: "Your own respellings for names the voice gets wrong, kept with your data.",
        steps: [
          "Open the player's settings (the speed button in the player bar) and find Pronunciation.",
          "Add the word as written and the way it should be said, one entry per name.",
          "Entries live in your database, so they survive a reinstall and travel with backups.",
        ],
      },
      {
        id: "copy",
        title: "Copy verses",
        what: "Copying uses the layout you chose once, everywhere.",
        steps: [
          "Copy from the selection toolbar or the verse menu.",
          "Settings → Reading → When copying verses picks text only, text then reference, reference then text, or a Markdown quote, and whether the translation code is included.",
        ],
        links: [{ label: "Settings → Reading", to: "/settings?section=preferences" }],
      },
    ],
  },
  {
    title: "Panes",
    entries: [
      {
        id: "panes-open",
        title: "Open a study pane",
        what: "A study pane sits beside the text and follows the verse you select.",
        steps: [
          "Click one of the icons on the right edge of the window: Commentary, Cross references, Confessions, Mine, Encyclopedia for passage, Atlas, and in the Psalms the Metrical Psalter. Press [Ctrl]+[B] to add a Commentary pane or focus the study pane that is open.",
          "The new pane opens to the right of the one you are in, or below it when that pane is narrow.",
          "The pane's ⋯ menu offers Show instead, which changes what it shows to any page.",
        ],
        links: [{ label: "Bible", to: "/" }],
      },
      {
        id: "panes-new",
        title: "Open anything in a new pane",
        what: "Anything that can be clicked can be opened beside what you are reading instead of replacing it.",
        steps: [
          "[Ctrl]+click (or middle-click) a sidebar item, a reference, a cross reference, a note link, or a search result.",
          "Use the new pane button on a reference preview card.",
          "In the Go to box, type > and Open … in a new pane for any page.",
          "The workspace holds up to eight panes.",
        ],
      },
      {
        id: "panes-header",
        title: "The pane header",
        what: "With more than one pane, each has a header: a grip, a link-group letter, its title, and buttons.",
        steps: [
          "Click anywhere in a pane to focus it; the focused pane has an accent line under its header, and shortcuts, Back and Forward, and the address act on it.",
          "Press [Ctrl]+[1] to [Ctrl]+[8] to focus panes in reading order: left to right, top to bottom.",
          "The ⋯ menu changes the content, splits the pane, swaps it with a neighbor, maximizes it, or closes it. The × closes it.",
          "Double-click the header to give the pane the whole area; double-click again or press [Esc] to bring the others back.",
        ],
      },
      {
        id: "panes-split",
        title: "Split a pane",
        what: "Any pane can be split to the right or downward, leaving an empty slot that offers to add content.",
        steps: [
          "Press [Ctrl]+[\\] to split the focused pane to the right, or [Ctrl]+[Shift]+[\\] to split it downward. The ⋯ menu has Split right and Split down.",
          "In the empty slot, click Add content… and pick a page, drag a pane in, or [Ctrl]+click any link to open it there.",
          "Click the × in the empty slot's corner to close it again.",
          "Drag the rule between any two panes to resize them; every rule is independent. With the rule focused, [←] [→] or [↑] [↓] move it by keyboard.",
        ],
      },
      {
        id: "panes-drag",
        title: "Move a pane by dragging",
        what: "The dotted grip at the left of a pane's header moves the pane anywhere.",
        steps: [
          "Press on the grip and drag. A chip with the pane's name follows the pointer.",
          "Drop on the left, right, top, or bottom edge of another pane to split that pane and put the dragged pane there. The half it will take is shown as you hover.",
          "Drop on the middle of another pane to add the dragged pane as a tab of that pane.",
          "Press [Esc] while dragging to cancel.",
        ],
      },
      {
        id: "panes-tabs",
        title: "Tabs in a pane",
        what: "A pane holding several pages shows them as tabs in its header.",
        steps: [
          "Click a tab to show it; [←] and [→] with a tab focused move between them. Each tab has a × to close it.",
          "Drag a tab by itself: between other tabs to reorder, onto another pane's edge to split it out, or onto a pane's middle to move it there.",
          "Move this tab to its own pane in the ⋯ menu splits it out to the right.",
          "A quick arrangement with fewer slots than panes puts the extra panes in the last slot as tabs.",
        ],
      },
      {
        id: "panes-layout",
        title: "Quick arrangements",
        what: "The layout button applies a template to the panes you have: one pane, two columns, two plus one, three columns, three plus one, two by two, or two by three.",
        steps: [
          "Click the layout button in the top bar (the grid icon beside Workspaces) and pick a template.",
          "Panes fill the template in reading order; extras become tabs in its last slot.",
          "The template is a starting point: split, drag, and resize afterwards however you like.",
          "If the window is narrower than the arrangement needs, a hint bar says so; stack some panes as tabs, or pick a smaller template.",
        ],
        links: [{ label: "Open the layout menu", press: "layout" }],
      },
      {
        id: "panes-workspaces",
        title: "Workspaces: save and switch arrangements",
        what: "A workspace is the panes and their arrangement, saved under a name.",
        steps: [
          "Click Workspaces in the top bar.",
          "Presets: Devotion (the Bible alone), Sermon prep (Bible, Matthew Henry, Sermons, and Mine in a two by two, all in group A), and Word study (Bible, Interlinear, and Lexicon side by side).",
          "Click Save current as… to keep what you have open under a name; each saved row has rename and delete buttons.",
          "Switching keeps the chapter you are reading in every Bible pane that shares a link group with one in the new arrangement.",
          "Saved workspaces are stored with your data, so they survive a reinstall and travel with backups. The workspace you have open always comes back on launch.",
        ],
        links: [{ label: "Open the Workspaces menu", press: "workspaces" }],
      },
      {
        id: "panes-link",
        title: "Link groups",
        what: "The letter at the left of a pane header says which panes follow each other.",
        steps: [
          "Panes in one group (A, B, or C) follow each other's passage: click a verse in a group-A Bible and every group-A commentary, cross-reference, and confession pane moves to it, while a Bible pane in group B stays put.",
          "Click the letter to move a pane between groups, or to unlink it (a dash).",
          "A pane you open from another pane joins that pane's group.",
          "A sermon pane leads its group without following it: the passage under your cursor turns the panes beside it, and a verse clicked there never moves the manuscript.",
        ],
      },
      {
        id: "panes-error",
        title: "If a pane shows an error",
        what: "A view that fails shows a card in its pane; the rest of the workspace keeps working.",
        steps: ["Click Try again on the card.", "If it fails again, change the pane to another page from its ⋯ menu and use Settings → Data & backups → Open logs folder to find the crash log to send along."],
        links: [{ label: "Settings → Data & backups", to: "/settings?section=backups" }],
      },
    ],
  },
  {
    title: "Notes",
    entries: [
      {
        id: "notes-add",
        title: "Add a note",
        what: "A note attaches to a verse or a highlight; a chapter note attaches to the chapter.",
        steps: [
          "From the selection toolbar or the verse menu, choose the note icon.",
          "Write in the editor. A note attached to a highlight shows a small note icon next to the highlighted text.",
          "Chapter notes are behind the note icon in the reading toolbar.",
        ],
        links: [{ label: "Notes", to: "/notes" }],
      },
      {
        id: "notes-templates",
        title: "Start a note from a template",
        what: "An empty note offers headed sections to start from.",
        steps: [
          "While a note is empty, click Start from… in its toolbar.",
          "Pick Observation / Interpretation / Application, Question and answer, Sermon outline, or Prayer response.",
          "Rename, reorder, edit, or add templates under Settings → Reading → Note templates.",
        ],
        links: [{ label: "Settings → Reading", to: "/settings?section=preferences" }],
      },
      {
        id: "notes-find",
        title: "Find your notes later",
        what: "The Notes page lists every note with the verse it was written on.",
        steps: ["Open Notes in the sidebar.", "Sort by Bible order or date; search; filter by tag."],
        links: [{ label: "Notes", to: "/notes" }],
      },
      {
        id: "notes-mentions",
        title: "Notes that mention a verse",
        what: "A reference written inside any note marks that verse wherever you read it.",
        steps: ["Write a reference such as Romans 8:28 in a note.", "That verse gets a faint dot by its number in the text.", "A Mine pane lists such notes under Mentioned in."],
      },
      {
        id: "mine",
        title: "Mine: your notes beside the text",
        what: "The Mine pane shows everything of yours on the chapter you are reading.",
        steps: [
          "Click Mine on the right edge.",
          "Notes, chapter notes, and highlights appear in verse order, with the selected verse's items pinned to the top, then notes elsewhere that mention this chapter under Mentioned in, then the sermons preached from or quoting it.",
          "Each note has Edit and Jump; New note for v. N writes a note on the selected verse.",
        ],
        links: [{ label: "Mine", to: "/study/mine" }],
      },
      {
        id: "trash",
        title: "Get a deleted note back",
        what: "Deleted notes, chapter notes, and prayer entries wait in the Trash for thirty days.",
        steps: [
          "Click Undo on the toast right after deleting.",
          "Later, open Settings → Data & backups → Trash, and click Restore or Delete permanently on any item.",
          "The Notes and Prayer pages show a small Trash link while it holds something of theirs.",
        ],
        links: [{ label: "Settings → Data & backups", to: "/settings?section=backups" }],
      },
    ],
  },
  {
    title: "Original languages",
    entries: [
      {
        id: "interlinear",
        title: "Interlinear",
        what: "The Hebrew or Greek beneath each phrase, aligned word by word, in its own pane.",
        steps: [
          "Click Interlinear in the reading toolbar.",
          "Click any tagged word to see its lexicon entry in a popup; View full entry opens the Lexicon page with a concordance of every verse using that word.",
          "Settings → Reading → Bible text → Show grammar codes in interlinear view adds the parsing under each word.",
        ],
        links: [
          { label: "Interlinear", to: "/interlinear" },
          { label: "Settings → Reading", to: "/settings?section=preferences" },
        ],
      },
      {
        id: "word-lookup",
        title: "Look up a word while reading",
        what: "A Strong's entry for any word in the text, without switching to interlinear.",
        steps: [
          "Double-click a word in the Bible text.",
          "The popup shows the Strong's entry. The tagging follows the KJV's wording, so it matches best there; when a word cannot be matched, the popup offers to search the lexicon for it.",
          "From the popup, open the word's study, or its entry in each full lexicon that has it.",
          "A proper name opens the Factbook entry for the person or place that verse means: the Zechariah of 2 Chronicles 24, not a list of every Zechariah.",
        ],
      },
      {
        id: "lexicon",
        title: "Lexicon",
        what: "Strong's Hebrew and Greek with Thayer's, and behind them the full lexicons: Brown–Driver–Briggs for Hebrew, Abbott-Smith and Liddell–Scott–Jones for Greek, and STEPBible's brief lexicons for both.",
        steps: [
          "Open Lexicon in the sidebar.",
          "Search by English meaning, transliteration, or Strong's number (H1, G25).",
          "Above an entry, a row of buttons switches between Strong's and each lexicon that has the word. The Strong's popup offers the same buttons.",
          "To search every lexicon at once, open Search and choose the Lexicons tab. Greek and Hebrew words can be typed without accents or vowel points.",
          "Each entry lists a concordance of the verses that use the word.",
        ],
        links: [{ label: "Lexicon", to: "/lexicon" }],
      },
      {
        id: "word-study",
        title: "Word study",
        what: "One Hebrew or Greek word, studied: how often it occurs, where, how the KJV renders it, the forms it takes with their parsing, the words it comes from and gives rise to, and every occurrence.",
        steps: [
          "Double-click a word in the text, or click one in the interlinear, and choose Word study in the popup. A lexicon entry has the same button.",
          "The counts are of the Hebrew Old Testament and the Greek New Testament (Textus Receptus) themselves, not of any English translation.",
          "Click a rendering to list only the verses where the KJV renders the word that way; click a bar or a book to list only that book's.",
          "The occurrence list shows each verse in the translation you are reading; the list beside it switches translation.",
          "The send-to-sermon button puts a short summary of the study into the open sermon.",
        ],
        links: [{ label: "Word study", to: "/wordstudy" }],
      },
      {
        id: "factbook",
        title: "Factbook: people and places",
        what: "A page for every person, place and named thing in the Bible: which Zechariah a verse means, who his father was, every verse that names him, and what the encyclopedia and dictionaries say.",
        steps: [
          "Double-click a name in the text. The popup names the person or place that verse means; click it to open the Factbook entry.",
          "Or open Factbook in the sidebar and type a name, or search for it and choose the People and places tab.",
          "An entry lists the forms of the name in English, Hebrew and Greek (click one for its word study), the family as links, every verse by book, and the encyclopedia article and dictionary entries inline. A place opens in the atlas.",
          "For the chapter you are reading, add the People and places pane: it follows the passage and lists everyone and everywhere the chapter names, those in the selected verse first.",
          "The identifications and family links are STEPBible's (Tyndale House, CC BY 4.0).",
        ],
        links: [{ label: "Factbook", to: "/factbook" }],
      },
      {
        id: "timeline",
        title: "Timeline",
        what: "Every major event of the Bible on one line, from Creation to Paul in Rome: the eras, the kings of Judah and Israel side by side, and where the chapter you are reading falls.",
        steps: [
          "Open Timeline in the sidebar. Wheel to zoom, drag to move along it, or pick an era from the list. Zoomed out, the larger events show first; zoom in for the rest.",
          "Click an event for the verses that record it, the people (to the Factbook) and places (to the atlas), and the atlas journeys of its era.",
          "Beside the text, add the Timeline for passage pane: it follows the chapter, marks its years, and lists the events it records.",
          "Dates are approximate, as the Theographic Bible Metadata gives them (a traditional chronology, Ussher's for the early ages).",
        ],
        links: [{ label: "Timeline", to: "/timeline" }],
      },
      {
        id: "grammar-search",
        title: "Search by grammar",
        what: "Find every word with a given parsing, such as every aorist imperative in Ephesians, without knowing any code letters.",
        steps: [
          "Open Search and choose the Grammar tab.",
          "Pick the Greek New Testament or the Hebrew Old Testament, then any of the fields: part of speech, tense, voice, mood, person, number, gender, case, and for Hebrew the stem and state.",
          "Type a word to narrow it: a Strong's number (G3056) or the word itself, with or without accents or vowel points.",
          "Choose a book to search just that book. Each result shows the matching words with their parsing and the verse in the translation you are reading.",
        ],
        links: [{ label: "Open Search", press: "search" }],
      },
      {
        id: "dictionary",
        title: "Dictionary",
        what: "Short entries on people, places, and topics from Easton's and Smith's, merged where both cover a headword.",
        steps: [
          "Open Dictionary in the sidebar; browse by letter or search.",
          "The box above the list reads from both dictionaries or from either alone. Easton's has about 1,300 headwords Smith's lacks and Smith's about 1,850 Easton's lacks.",
          "An entry spelled differently by the two (Abel-meholah, Abelmeholah) is one entry with both articles, found by either spelling.",
          "Scripture references inside an entry are clickable; where the encyclopedia covers the same headword, a link at the top offers the fuller article.",
        ],
        links: [{ label: "Dictionary", to: "/dictionary" }],
      },
      {
        id: "encyclopedia",
        title: "Encyclopedia",
        what: "The International Standard Bible Encyclopedia (1915), edited by James Orr: 9,349 articles.",
        steps: [
          "Open Encyclopedia in the sidebar. Browse by letter down the left, or search; the search looks inside the articles as well as at their titles.",
          "Every Scripture citation is a link that previews the verse. References to other articles are underlined with dots; click one to go there.",
          "Long articles get a Contents list built from their headings, beside the text when the pane is wide and folded into a box at the top when it is narrow.",
          "Click Send to sermon on an article to quote it in the open sermon; select a passage first to quote only that.",
        ],
        links: [{ label: "Encyclopedia", to: "/encyclopedia" }],
      },
      {
        id: "encyclopedia-passage",
        title: "What the encyclopedia says about the chapter you are reading",
        what: "An Encyclopedia for passage pane lists the articles that discuss the open chapter, ranked by how much of each article is about it.",
        steps: [
          "Click Encyclopedia for passage on the right edge, beside a Bible pane.",
          "Each article shows which verses it cites. Select a verse and the articles on that verse move to the top.",
        ],
        links: [{ label: "Encyclopedia for passage", to: "/study/encyclopedia" }],
      },
    ],
  },
  {
    title: "Atlas",
    entries: [
      {
        id: "atlas",
        title: "The map",
        what: "A map of the biblical world with 1,342 places, each with coordinates, its modern identification where there is one, and every verse that names it.",
        steps: [
          "Open Atlas in the sidebar.",
          "Drag to pan and scroll to zoom, or use the buttons at the top right; the third one returns to the whole map. With the map focused, the arrow keys pan and + and − zoom.",
          "Search or scroll the list on the left, or click a dot on the map. The place's details come up on the right with every verse that names it; click a verse to open the passage.",
          "Beneath the list are switches for place names and region borders, and a size for the names.",
        ],
        links: [{ label: "Atlas", to: "/atlas" }],
      },
      {
        id: "atlas-follow",
        title: "The map follows your reading",
        what: "An Atlas pane beside a Bible pane marks the places named in the open chapter.",
        steps: ["Open the Atlas beside a Bible pane in the same link group.", "The chapter's places are marked in the accent color and framed. Open Acts 17 and Thessalonica, Berea, and Athens light up together."],
        links: [{ label: "Atlas", to: "/atlas" }],
      },
      {
        id: "atlas-journeys",
        title: "Journeys",
        what: "Fourteen routes through Scripture, from Abraham's travels and the Exodus to Paul's journeys and the voyage to Rome.",
        steps: ["Click the Journeys tab in the Atlas.", "Each leg is numbered on the map and listed with the verse that records it."],
        links: [{ label: "Atlas", to: "/atlas" }],
      },
      {
        id: "atlas-confidence",
        title: "How sure the map is",
        what: "Each place carries a confidence, and uncertain borders are drawn as a soft wash inside a dashed line.",
        steps: [
          "Faded dots are places whose location is probable, possible, or proposed rather than certain; the detail panel says which, and how many modern sites have been proposed.",
          "Region borders come from scholarly estimates; the selected region is drawn most clearly.",
        ],
      },
    ],
  },
  {
    title: "Confessions",
    entries: [
      {
        id: "westminster",
        title: "Browse the Westminster Standards",
        what: "The Westminster Confession and the Larger and Shorter Catechisms, with their Scripture proofs.",
        steps: [
          "Open Confessions in the sidebar.",
          "Pick a document, then a chapter or question, or browse by doctrinal topic on the Topics tab.",
          "Each section's proofs are numbered in the text and listed beneath it; click one to open the passage.",
        ],
        links: [{ label: "Confessions", to: "/westminster" }],
      },
      {
        id: "confessions-passage",
        title: "From the Bible side",
        what: "A Confessions pane shows where the Standards cite the verse you selected.",
        steps: ["Click Confessions on the right edge, beside a Bible pane.", "Select a verse; the sections that cite it are listed."],
        links: [{ label: "Confessions for passage", to: "/study/confessions" }],
      },
    ],
  },
  {
    title: "Resources (books, audio, and video)",
    entries: [
      {
        id: "resources-add",
        title: "Add a book or a recording",
        what: "Resources holds your own EPUB, PDF, and MOBI books and your audio and video files.",
        steps: [
          "Open Resources in the sidebar and click Add resource for one file, or Import folder for every recognized file under a folder.",
          "The title and author are read from the file when it is added: an EPUB's metadata, a PDF's document properties, a recording's tags. The file name is the fallback.",
          "For a folder import, the author is the file's parent folder, so an Author/Book.epub layout works well.",
          "Books are indexed as they are added, so search can look inside them.",
        ],
        links: [{ label: "Resources", to: "/resources" }],
      },
      {
        id: "resources-organize",
        title: "Find your way around the library",
        what: "The page filters by kind and groups by author, by when things were added, or by topic.",
        steps: [
          "Click All, Books, Audio, or Video across the top; each shows its count.",
          "Choose Group by: Author (Speaker on the Audio and Video tabs), Recently added, or Topic.",
          "Click a group heading to expand it; Expand all opens every group.",
          "Click a Topic tag above the list to show only resources carrying it. Add tags to any item in its row.",
          "A recording shows its length and file type; click the play button to open it.",
        ],
        links: [{ label: "Resources", to: "/resources" }],
      },
      {
        id: "resources-edit",
        title: "Correct a title or author",
        what: "Any item's title and author can be changed, including a shipped book.",
        steps: [
          "Click the ⋮ on the item's row and choose Edit details….",
          "Change the title or the author (Speaker for a recording); existing authors are suggested as you type. Click Save.",
          "Items with no author are grouped under No author yet. Click Set author for all… on that heading to give every item in the group one author at once.",
          "An edit to a shipped book is kept across upgrades.",
        ],
        links: [{ label: "Resources", to: "/resources" }],
      },
      {
        id: "resources-book",
        title: "Read a book",
        what: "A book opens as a page on a desk, with its chapters listed beside it.",
        steps: [
          "Click a book's title. It opens at the place you last read; the position is stored with your data.",
          "The zoom buttons above the page make the page larger or smaller: [Ctrl]+scroll over the page, or [Ctrl]+[=] and [Ctrl]+[-] while the book has focus, do the same; the arrows button fits the page to the pane's width.",
          "The type button above the page sets text size, spacing, font, and how wide a line runs, and can show the book exactly as its publisher styled it.",
          "[Space] and PageDown turn the page, carrying on into the next chapter; PageUp goes back; [←] and [→] jump a chapter; [Home] and End go to the top and bottom of the chapter.",
          "The bar underneath shows how far through the book you are and can be dragged to anywhere in it. Contents in the sidebar lists the chapters (the list icon when the pane is narrow).",
        ],
        links: [{ label: "Resources", to: "/resources" }],
      },
      {
        id: "resources-pdf",
        title: "PDF zoom and find",
        what: "A PDF shows one page at a time with its own zoom and a find box for the page.",
        steps: [
          "The bar above the page zooms in and out; click the percentage to fit the page to the pane's width.",
          "Type in Find on this page: every match is marked; [Enter] and [Shift]+[Enter] step through them; [Esc] clears.",
          "To search a whole book, use the main search instead.",
        ],
      },
      {
        id: "resources-media",
        title: "Play a recording",
        what: "Audio and video play in the pane with a speed control.",
        steps: [
          "Click the recording's title, or its play button.",
          "Choose a speed under the player: 0.75×, 1×, 1.25×, 1.5×, or 2×.",
          "Click Link to current passage in the sidebar while it plays to link the passage to that moment; the link opens the recording at that time.",
        ],
      },
      {
        id: "resources-link",
        title: "Link a resource to a passage",
        what: "A linked resource appears under the chapter's title while reading that passage.",
        steps: [
          "Open the resource and click Link to current passage in its sidebar. The passage is whatever the Bible pane beside it is on.",
          "Link to another resource, below it, connects two resources to each other.",
          "In the Bible, the Related row under the chapter title lists linked resources and, from your topic tags, resources Suggested by topic tag.",
        ],
      },
      {
        id: "resources-searchable",
        title: "A book marked not searchable",
        what: "A book whose text could not be read is still in the library; it just cannot be searched inside.",
        steps: [
          "Click the amber not searchable label on the row to read the file again. The label says how it went.",
          "A PDF made of page images has no words to index; it still opens and reads normally.",
        ],
      },
      {
        id: "book-library",
        title: "The book library: shelves to install",
        what: "The library comes as separate packs, one per shelf: Puritan and Reformed works, the Church Fathers, ancient literature (Josephus, Philo, 1 Enoch, the Roman historians), and the nineteenth century (Schaff, Edersheim). Install any or all.",
        steps: [
          "Download the packs you want from the Sojourner releases page (or copy them from a USB stick). Nothing is fetched from inside the app.",
          "Open Settings → Book library and click Install from file…, once for each pack. It takes a minute or two; you can keep reading meanwhile.",
          "Each shelf is listed with its size and can be removed on its own. Installing a newer pack for a shelf you have replaces it; the other shelves are not touched.",
          "Installed books show a Library badge in Resources: read, search, tag, and link them like any other, though they cannot be removed one at a time.",
          "If a shelf is removed, books you had notes or tags on show Not installed; everything you wrote about them is kept, and comes back if you install it again.",
        ],
        links: [
          { label: "Settings → Book library", to: "/settings?section=books" },
          { label: "Resources", to: "/resources" },
        ],
      },
      {
        id: "citations",
        title: "Cited in your library",
        what: "Every book on your installed shelves, and every book of your own, that cites the verse you are reading: Augustine and Chrysostom on it, Josephus beside it, the Puritans preaching it.",
        steps: [
          "A small book icon and number after a verse shows how many times your library cites it. Click it to list them.",
          "Or add the Cited in your library pane beside the text: it follows the passage, grouped by shelf, each with the words around the reference.",
          "Click a citation to open the book at that place, with the reference marked.",
          "Install more shelves (Church Fathers, Ancient literature, Nineteenth century) from Settings → Book library. Your own books are indexed too once their text has been read.",
        ],
        links: [{ label: "Settings → Book library", to: "/settings?section=books" }],
      },
    ],
  },
  {
    title: "Prayer",
    entries: [
      {
        id: "prayer-journal",
        title: "Journal entries",
        what: "A prayer entry is written in the ACTS pattern or as free writing, with a passage attached if you like.",
        steps: ["Open Prayer in the sidebar and click New entry.", "Choose ACTS (Adoration, Confession, Thanksgiving, Supplication) or free writing.", "Attach a passage to keep a promise beside the prayer. Add tags, and click a tag later to filter the list."],
        links: [{ label: "Prayer", to: "/prayer" }],
      },
      {
        id: "prayer-list",
        title: "Prayer list",
        what: "People and requests, kept apart from journal entries, with a record of when each was prayed for.",
        steps: [
          "Click the Prayer list tab on the Prayer page and add a person or request.",
          "Click Prayed today to log it; click Answered to archive it with a note of how God answered.",
          "Anyone not prayed for in fourteen days gets an amber marker; change the number in Nudge after … days. Sort by Longest since prayed to put the most neglected first.",
          "Click Print to print the list grouped by category with a box beside each name.",
        ],
        links: [{ label: "Prayer", to: "/prayer" }],
      },
    ],
  },
  {
    title: "Memory",
    entries: [
      {
        id: "memory-add",
        title: "Add a verse to memorize",
        what: "A memory card is a passage in one translation, reviewed on a schedule that spaces out as you get it right.",
        steps: [
          "Open Memory in the sidebar and type a reference under Add a verse or passage, such as Philippians 4:6-7.",
          "Choose the Translation: the box starts on the one you are reading, and Reader's translation follows whichever Bible you have open.",
          "Choose a Practice mode and click Add.",
          "Or right-click any verse while reading and choose Add to Scripture memory; the card takes that pane's translation.",
          "Each card in the deck shows its translation code; change it there, or mid-practice from the card's header.",
        ],
        links: [{ label: "Memory", to: "/memory" }],
      },
      {
        id: "memory-practice",
        title: "Practice",
        what: "Three practice modes, graded by you, feed the spacing.",
        steps: [
          "Click Practice what's due, or Practice on one card. The Memory item in the sidebar shows how many are due today.",
          "First letter shows only the first letter of each word; Blank word hides random words; Type it has you type the verse and checks it word for word. Change the mode any time from the card's row.",
          "Press [Space] to reveal, [Enter] to check what you typed ([Shift]+[Enter] adds a line), and [1] to [4] to grade: Again, Hard, Good, Easy. [Backspace] goes back a card.",
          "Read in context opens the verse in the Bible.",
          "Add a doctrinal note under any card to keep its sense beside its words.",
        ],
        links: [{ label: "Memory", to: "/memory" }],
      },
      {
        id: "memory-catechism",
        title: "Catechism",
        what: "The Catechism tab memorizes Shorter or Larger Catechism answers with the same tools.",
        steps: ["Click the Catechism tab on the Memory page.", "Add a question by number; practice and grade it the same way. Read in context opens the question in the Confessions."],
        links: [{ label: "Memory", to: "/memory" }],
      },
    ],
  },
  {
    title: "Reading plans and the Harmony",
    entries: [
      {
        id: "plans-start",
        title: "Start a reading plan",
        what: "A plan lists readings by day; ticking a day records it, and Today shows the day's readings.",
        steps: [
          "Open Reading plans in the sidebar, open a plan, and click Start (or type start reading plan in the Go to box).",
          "Tick each day as you read; the next unread day is highlighted.",
          "Today's plan on the Today page shows the day's readings with checkboxes.",
        ],
        links: [{ label: "Reading plans", to: "/plans" }],
      },
      {
        id: "plans-bundled",
        title: "The plans that ship",
        what: "Five plans come with the app; each says where its order comes from.",
        steps: [
          "M'Cheyne's Reading Plan: Robert Murray M'Cheyne's 1842 calendar, four readings a day; the Old Testament once and the New Testament and Psalms twice in a year.",
          "Chronological in a Year: the Bible in the order the events happened, in George Townsend's arrangement (Old Testament 1821, New Testament 1826, on John Lightfoot's chronicle); the day boundaries are the app's own division of his sections into 365 days.",
          "Canonical (Straight Through): Genesis to Revelation over a year, evenly divided.",
          "90-Day Bible: the same order in three months.",
          "Psalms and Wisdom: a psalm a day with Job, Proverbs, Ecclesiastes, and the Song of Solomon alongside, 150 days.",
        ],
        links: [{ label: "Reading plans", to: "/plans" }],
      },
      {
        id: "plans-catchup",
        title: "Catch up when you fall behind",
        what: "When the calendar has run ahead of your ticks, the plan offers three ways to catch up, each with Undo.",
        steps: [
          "The plan page and the Today page say You're N days behind.",
          "Shift my schedule moves the plan so today becomes the next unread day and nothing is skipped.",
          "Spread over 7 days keeps your dates but re-spaces the missed readings across the coming week.",
          "Skip to today marks the missed days as read (confirmed first).",
        ],
        links: [{ label: "Reading plans", to: "/plans" }],
      },
      {
        id: "plans-build",
        title: "Build your own plan",
        what: "A custom plan divides books evenly over a length, or takes one line per day.",
        steps: [
          "Click New plan on the Reading plans page.",
          "A book in N days picks books (or a testament) and a length and divides the chapters evenly.",
          "From a list takes one line per day: a book, a chapter, a range like Psalms 1-5, verses like John 3:16-21, or several readings separated by semicolons.",
          "Choose the days of the week you read on; the plan's dates skip the others.",
          "Your plans sit beside the built-in ones with a Custom mark, and can be edited, exported, or deleted from their page.",
        ],
        links: [{ label: "Reading plans", to: "/plans" }],
      },
      {
        id: "harmony",
        title: "Harmony of the Gospels",
        what: "The events of Christ's life in order, with the parallel Gospel accounts side by side.",
        steps: [
          "Open Harmony in the sidebar and click Compare on an event to see its parallel accounts.",
          "The picker at the top right switches between the two harmonies that ship: a four-column chronological harmony of 136 events, and A. T. Robertson's (1922) of 185 events in fourteen periods with place and date under most events. Your choice is remembered.",
          "Events Robertson footnoted show a Note button; the Explanatory notes tab holds his fourteen discussions of the hard cases (the genealogies, the date of the Nativity, the hour of the crucifixion).",
        ],
        links: [{ label: "Harmony", to: "/harmony" }],
      },
    ],
  },
  {
    title: "Sermons",
    entries: [
      {
        id: "sermon-write",
        title: "Write the manuscript",
        what: "A sermon is a document whose points are its outline.",
        steps: [
          "Open Sermons in the sidebar and click New sermon (or type new sermon in the Go to box).",
          "Press [Ctrl]+[Alt]+[1] to make a line a point and [Ctrl]+[Alt]+[2] a sub-point. The toolbar adds quotations, a rule, and underline ([Ctrl]+[U]) alongside bold and italic.",
          "An empty manuscript offers Start from…: Expository, Textual, Topical, Evangelistic, Funeral, Wedding, and Bible study. Edit the templates under Settings → Reading → Sermon templates.",
        ],
        links: [
          { label: "Sermons", to: "/sermons" },
          { label: "Settings → Reading", to: "/settings?section=preferences" },
        ],
      },
      {
        id: "sermon-passages",
        title: "Passages are live, not pasted",
        what: "A passage block holds a reference and renders its words in the sermon's translation every time.",
        steps: [
          "Press [Ctrl]+[Shift]+[P] (or the book button) and type a reference.",
          "A new sermon's translation is Reader's, which follows the Bible pane; pin one in the sermon's header, and every passage in the manuscript rewrites at once. A block's menu can pin that block alone to another translation for a comparison.",
          "Red letters, footnotes, and hover previews work inside a block.",
        ],
        links: [{ label: "Sermons", to: "/sermons" }],
      },
      {
        id: "sermon-send",
        title: "Send the study into the sermon",
        what: "Everywhere you read there is a microphone button that drops what you are reading into the open sermon.",
        steps: [
          "Click the microphone on a verse, a commentary entry, a confession section, a cross reference, a Strong's or dictionary entry, an encyclopedia article, or a selection in a book.",
          "Scripture arrives as a live passage block; everything else as a citation with its source line.",
          "Open source on a citation reopens that entry in a pane beside the manuscript. The side panel's Sources tab is the sermon's bibliography.",
        ],
      },
      {
        id: "sermon-leads",
        title: "The manuscript drives the panes beside it",
        what: "A sermon pane in a link group turns the Bible and study panes to the passage under the cursor.",
        steps: [
          "Give the sermon pane a link group with the letter in its header.",
          "The Bible, commentary, and cross references beside it follow the passage under your cursor; a verse clicked there never moves the manuscript.",
          "Follow the cursor in the footer turns it off. The Sermon prep workspace sets this up.",
        ],
        links: [{ label: "Open the Workspaces menu", press: "workspaces" }],
      },
      {
        id: "sermon-prep",
        title: "The prep track",
        what: "Six stages across the top of every sermon move themselves as the evidence appears.",
        steps: [
          "Text, Study, Outline, Manuscript, Rehearsed, Preached: a text set, two sources sent, two points written, the words reaching 60% of your target, a rehearsal timed, a preaching logged.",
          "A line under the track says what the next stage is waiting for.",
          "Click a stage to set it by hand, including backwards; that sticks until something new happens.",
        ],
      },
      {
        id: "sermon-rehearse",
        title: "Rehearse",
        what: "A rehearsal runs the clock beside the manuscript and logs the run.",
        steps: [
          "Click Rehearse. When you finish, log the run with its minutes, word count, and a note.",
          "Rehearse aloud reads the manuscript section by section with the clock going.",
          "Every logged run feeds the speaking rate the app quotes your minutes at: from two timed runs on, it uses your words a minute over the last ten. Settings → Reading → Speaking rate shows what it measured.",
        ],
        links: [{ label: "Settings → Reading", to: "/settings?section=preferences" }],
      },
      {
        id: "sermon-preach",
        title: "Preaching mode",
        what: "Preach hides everything but the manuscript at a pulpit size, paged at its points.",
        steps: [
          "Click Preach (or type preach in the Go to box).",
          "[Space], PageDown, or [→] advance; [←] goes back; the screen's left and right thirds are tap zones. [Home] goes to the first section and End to the last.",
          "Press [T] to start or pause the clock. The bar shows time elapsed and left against your target, the point you are in, and the one coming.",
          "[Ctrl]+[=] and [Ctrl]+[-] change the pulpit size, which is remembered.",
          "Press [Esc] to leave (confirmed while the clock is running) and log the run.",
        ],
      },
      {
        id: "sermon-slides",
        title: "Slides, without building any",
        what: "Slides are generated from the manuscript: a title slide, one per point with sub-points as bullets, one per passage, and one per short quotation or illustration.",
        steps: [
          "Open the side panel's Slides tab to preview them and start from any slide.",
          "Present the slides shows them full screen on a dark ground: [→] and [Space] advance, [←] goes back, [Home] and End jump to the ends, [Esc] leaves.",
          "Export slides as .pptx writes the same deck for PowerPoint.",
        ],
      },
      {
        id: "sermon-handout",
        title: "Blanks for the handout",
        what: "A word or phrase can be marked as a blank that prints as a rule on the fill-in handout.",
        steps: ["Select the words and press [Ctrl]+[Shift]+[B]. They get a dotted underline in the manuscript.", "Print & export → the fill-in handout prints the blanks, with or without the answer key."],
      },
      {
        id: "sermon-after",
        title: "After the sermon",
        what: "Marking a sermon preached writes down the date, the church, and the time it took, and opens a reflection box.",
        steps: [
          "Click Mark as preached. The prep track and status follow it to Preached.",
          "The History list holds every rehearsal and preaching with its minutes; the Reflection box under it waits for what landed, what to cut, and what to say next time. The reflection is searchable with the rest of the sermon.",
          "The Mine pane and the Bible's Related row list the sermons preached from a chapter; a highlight on a verse you later preached from is marked in a sermon on the Highlights page.",
        ],
      },
      {
        id: "sermon-series",
        title: "A series, and a reading plan for the congregation",
        what: "A series keeps a preaching calendar and can turn its texts into a reading plan.",
        steps: [
          "In the Series section at the foot of the Sermons page, add a series and its sermons in order with their texts and dates.",
          "Click Make a reading plan: one reading the day before each sermon, or the text spread over the six days before it, named after the series and dated from the first sermon.",
          "The plan then behaves like any other: it shows on Today, can be started, caught up, and exported. Rebuilding it replaces its days and keeps the ticks that still fit.",
        ],
        links: [{ label: "Sermons", to: "/sermons" }],
      },
      {
        id: "sermon-print",
        title: "Print, hand out, export",
        what: "The Print & export menu prints the manuscript, the outline, or the handout, and exports Markdown.",
        steps: ["Click Print & export on a sermon.", "Choose the manuscript, the outline, or the fill-in handout with or without the answer key; every passage's words are printed, not only the references.", "Export as Markdown writes the whole sermon to a file. Printing to PDF is the print dialog's own choice."],
      },
      {
        id: "illustrations",
        title: "Illustrations",
        what: "Stories and quotations kept apart from any one sermon, with the source each came from and where it has been used.",
        steps: [
          "Click Save as illustration beside any selection, or add one on the Illustrations page.",
          "In a manuscript, click the bulb in the toolbar to insert one as a citation; the use is recorded, and you are warned when a story has already been told in this series.",
        ],
        links: [{ label: "Illustrations", to: "/illustrations" }],
      },
    ],
  },
  {
    title: "Settings",
    entries: [
      {
        id: "settings-reading",
        title: "Settings → Reading",
        what: "Every reading preference on one page, by its label.",
        steps: [
          "Reading: Open on (Bible or Today), Theme, Accent color, Text size, Line spacing, Font, and a Preview.",
          "Accessibility: Reduce motion.",
          "Bible text: Paragraph mode, Show verse numbers, Words of Jesus in red, Show highlights, Show note markers, Show grammar codes in interlinear view, Highlight colors, When copying verses, Note templates, Speaking rate, Sermon templates.",
        ],
        links: [{ label: "Settings → Reading", to: "/settings?section=preferences" }],
      },
      {
        id: "settings-backups",
        title: "Back up your data",
        what: "Everything you write lives in one file on this device; backups copy it.",
        steps: [
          "Open Settings → Data & backups. Back up now takes a snapshot; Export and Import move the whole database as a file; Check integrity verifies it.",
          "Tick Back up automatically every N days: a few seconds after the app opens, if the newest backup is older than that, one is taken quietly and a toast says so. Ten are kept.",
          "Also copy backups to a folder synced by OneDrive or Dropbox: click Choose folder.",
          "Recent backups lists each snapshot with Restore.",
          "With automatic backups off, a reminder appears once a month when your newest backup is more than thirty days old.",
        ],
        links: [{ label: "Settings → Data & backups", to: "/settings?section=backups" }],
      },
      {
        id: "settings-stats",
        title: "See your study stats",
        what: "Counts of what you have read, written, prayed, and memorized.",
        steps: ["Open Settings → Data & backups → Stats.", "Notes and highlights by book, a heatmap of the days you read over the past year (darker squares mean more chapters), and totals: chapters read, prayers logged, verses and catechism answers memorized, sermons preached this year, words written."],
        links: [{ label: "Settings → Data & backups", to: "/settings?section=backups" }],
      },
      {
        id: "settings-library",
        title: "Translations and commentaries",
        what: "Bible translations and commentaries can be added from XML files.",
        steps: ["Open Settings → Library and click Add file. Zefania XML is a Bible; ThML is a commentary; the format is detected.", "Each translation lists its verse count; a copyrighted one you imported is marked as yours.", "Click Rescan import folders after copying files into the imports folder by hand."],
        links: [{ label: "Settings → Library", to: "/settings?section=library" }],
      },
      {
        id: "settings-about",
        title: "Version, updates, and licences",
        what: "The About page names the version, checks for a newer one when asked, and lists the sources and licences of everything bundled.",
        steps: [
          "Open Settings → About. The version is shown at the top.",
          "Click Check for updates. The app asks GitHub for the latest version number and nothing else; nothing runs on its own and nothing installs itself. If a newer version exists, Open download page takes you to it in your browser.",
          "Sources and licences lists each bundled work and its terms.",
          "The app makes no other network request of its own accord.",
        ],
        links: [{ label: "Settings → About", to: "/settings?section=about" }],
      },
      {
        id: "tour",
        title: "Take the tour again",
        what: "The first launch walks through nine things in place: the Go to button, a verse, the Add pane strip, a pane header, the layout button, the three sidebar groups, and Settings.",
        steps: ["Click Show the tour again at the top of this page.", "Inside the tour, [→] and [←] step and [Esc] skips."],
        links: [{ label: "Start the tour", tour: true }],
      },
    ],
  },
];

/** The text of an entry, for the search box and the tests. */
export function entryText(entry: TutorialEntry): string {
  return [entry.title, entry.what, ...entry.steps].join("\n");
}
