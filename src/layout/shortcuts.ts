/**
 * Every shortcut the app answers to, in one list. The shortcuts sheet
 * (Ctrl+/) renders it, and the tutorial's test reads it to make sure each
 * key combination is explained somewhere in the tutorial. Add a row here
 * the day a shortcut ships.
 */

export interface ShortcutRow {
  /** Keys pressed together, or a gesture named in words ("Drag a grip"). */
  keys: string[];
  label: string;
}

export interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Navigate",
    rows: [
      { keys: ["Ctrl", "K"], label: "Go to a reference, Strong's number, or term" },
      { keys: ["Ctrl", "K", ">"], label: "List every command in the Go to box: panes, layouts, workspaces, paragraph mode, theme, text size, start a reading plan, new prayer entry, new sermon, open a sermon, preach or rehearse one, back up now, Settings sections" },
      { keys: ["Ctrl", "F"], label: "Search everything: Scripture, commentary, notes, prayers, resources, confessions, sermons, and illustrations, each in its own tab" },
      { keys: ["Ctrl", "G"], label: "Find in the chapter you are reading (Enter next match, Shift+Enter previous, Esc closes)" },
      { keys: ["Ctrl", "["], label: "Previous chapter in the pane you are reading" },
      { keys: ["Ctrl", "]"], label: "Next chapter in the pane you are reading" },
      { keys: ["Alt", "←"], label: "Back in the focused pane's history" },
      { keys: ["Alt", "→"], label: "Forward in the focused pane's history" },
    ],
  },
  {
    title: "Panes",
    rows: [
      { keys: ["Ctrl", "1"], label: "Focus the first pane (Ctrl+2 to Ctrl+8 for the others, in reading order: left to right, top to bottom)" },
      { keys: ["Ctrl", "B"], label: "Add a study pane, or focus the one that is open" },
      { keys: ["Ctrl", "\\"], label: "Split the focused pane to the right, leaving an empty slot that offers to add content (Ctrl+Shift+\\ splits it downward)" },
      { keys: ["Ctrl", "click"], label: "Open a link, a sidebar item, or a reference in a new pane (middle-click does the same)" },
      { keys: ["Click the letter"], label: "In a pane header: move the pane to link group A, B, or C, or unlink it. Panes in one group follow each other's passage" },
      { keys: ["Double-click a header"], label: "Maximize that pane; double-click again (or Esc) to bring the others back" },
      { keys: ["Drag the grip"], label: "The dotted grip at the left of a header (or a tab) moves the pane: drop it on another pane's edge to split that pane, on its middle to add it as a tab, or between tabs to reorder. Esc cancels" },
      { keys: ["Layout button"], label: "Top bar: a quick arrangement (one, two, two plus one, three, three plus one, two by two, two by three) applied to the panes you have; extra panes become tabs" },
      { keys: ["Workspaces"], label: "Top bar: switch to a preset (Devotion, Sermon prep, Word study) or a saved arrangement; save, rename, or delete your own" },
      { keys: ["F11"], label: "Focus mode: maximize the focused pane and hide everything else" },
      { keys: ["Esc"], label: "Leave focus mode or restore a maximized pane; close any panel, menu, or dialog" },
    ],
  },
  {
    title: "Reading",
    rows: [
      { keys: ["Ctrl", "D"], label: "Bookmark the current chapter or selected verse" },
      { keys: ["Ctrl", "="], label: "Larger text, two pixels at a time (Ctrl+scroll over the text does the same)" },
      { keys: ["Ctrl", "-"], label: "Smaller text" },
      { keys: ["Ctrl", "0"], label: "Reset the text size to 18px" },
      { keys: ["↓"], label: "Select the next verse (j does the same); linked panes follow" },
      { keys: ["↑"], label: "Select the previous verse (k does the same)" },
      { keys: ["Home"], label: "Select the first verse of the chapter (End selects the last)" },
      { keys: ["Enter"], label: "Open the selected verse's menu: highlight, note, copy, compare, memorize, bookmark" },
      { keys: ["Click a verse"], label: "Select it: linked study panes follow the selected verse" },
      { keys: ["Right-click a verse"], label: "Highlight, note, copy, compare, memorize, or bookmark" },
      { keys: ["Select text"], label: "Highlight or annotate just that span" },
      { keys: ["Double-click a word"], label: "Look up its Hebrew or Greek (Strong's) in a popup; matches best in the KJV" },
      { keys: ["Hover a reference"], label: "Preview the passage; Tab to a reference does the same. Esc closes it" },
    ],
  },
  {
    title: "Books",
    rows: [
      { keys: ["Ctrl", "scroll"], label: "Over a book in Resources: zoom the page (Ctrl+= and Ctrl+- do the same while the book has focus)" },
      { keys: ["Space"], label: "Page down through a book, running on into the next chapter at the end (PageUp goes back; ← and → jump a chapter)" },
    ],
  },
  {
    title: "Sermon",
    rows: [
      { keys: ["Ctrl", "Alt", "1"], label: "Make the line a point (Ctrl+Alt+2 makes it a sub-point)" },
      { keys: ["Ctrl", "Shift", "P"], label: "Insert a passage: type a reference and the block renders it live in the sermon's translation" },
      { keys: ["Ctrl", "Shift", "B"], label: "Mark the selected words as a blank for the fill-in handout" },
      { keys: ["Ctrl", "U"], label: "Underline (bold and italic are Ctrl+B and Ctrl+I, as everywhere)" },
      { keys: ["Rehearse"], label: "Runs the manuscript with the clock going; finishing offers to log the run with its minutes and a note" },
    ],
  },
  {
    title: "Preaching mode",
    rows: [
      { keys: ["Space"], label: "Next section (PageDown, → and ↓ do the same; the screen's right third is a tap zone)" },
      { keys: ["←"], label: "Previous section (PageUp and ↑ do the same; the left third is a tap zone)" },
      { keys: ["Home"], label: "First section (End goes to the last)" },
      { keys: ["T"], label: "Start or pause the clock" },
      { keys: ["Ctrl", "="], label: "Larger text at the pulpit (Ctrl+- smaller); the size is remembered" },
      { keys: ["Esc"], label: "Leave (confirmed while the clock is running) and offer to log the run" },
    ],
  },
  {
    title: "Slides",
    rows: [
      { keys: ["→"], label: "Next slide (Space and PageDown do the same; the screen's right third is a tap zone)" },
      { keys: ["←"], label: "Previous slide (PageUp does the same)" },
      { keys: ["Home"], label: "First slide (End goes to the last)" },
      { keys: ["Esc"], label: "Leave the slides" },
    ],
  },
  {
    title: "Memory practice",
    rows: [
      { keys: ["Space"], label: "Reveal the hidden verse or answer (first-letter and blank-word modes)" },
      { keys: ["Enter"], label: "Check what you typed (type-it mode; Shift+Enter adds a line)" },
      { keys: ["1"], label: "Grade the card: 1 Again, 2 Hard, 3 Good, 4 Easy" },
      { keys: ["Backspace"], label: "Back to the previous card" },
    ],
  },
];
