import { Modal } from "../components/ui/Modal";
import { Kbd } from "../components/ui/Page";

const GROUPS: { title: string; rows: { keys: string[]; label: string }[] }[] = [
  {
    title: "Navigate",
    rows: [
      { keys: ["Ctrl", "K"], label: "Go to a reference, Strong's number, or term" },
      { keys: ["Ctrl", "K", ">"], label: "List every command in the Go to box: panes, layouts, workspaces, paragraph mode, theme, text size, start a reading plan, new prayer entry, back up now, Settings sections" },
      { keys: ["Ctrl", "F"], label: "Search everything" },
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
      { keys: ["Ctrl", "1"], label: "Focus the first pane (Ctrl+2 to Ctrl+4 for the others, left to right)" },
      { keys: ["Ctrl", "B"], label: "Add a study pane, or focus the one that is open" },
      { keys: ["Ctrl", "click"], label: "Open a link, a sidebar item, or a reference in a new pane (middle-click does the same)" },
      { keys: ["Click the letter"], label: "In a pane header: move the pane to link group A, B, or C, or unlink it. Panes in one group follow each other's passage" },
      { keys: ["Double-click a header"], label: "Maximize that pane; double-click again (or Esc) to bring the others back" },
      { keys: ["Drag a header"], label: "Drop it on another pane to swap the two" },
      { keys: ["Layout button"], label: "Top bar: one, two, two plus one, three, or two-by-two panes. Below 1300px the window shows two columns with tabs" },
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
    title: "Memory practice",
    rows: [
      { keys: ["Space"], label: "Reveal the hidden verse or answer (first-letter and blank-word modes)" },
      { keys: ["Enter"], label: "Check what you typed (type-it mode; Shift+Enter adds a line)" },
      { keys: ["1"], label: "Grade the card: 1 Again, 2 Hard, 3 Good, 4 Easy" },
      { keys: ["Backspace"], label: "Back to the previous card" },
    ],
  },
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} size="md">
      <div className="space-y-5">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">{g.title}</h3>
            <dl className="space-y-1.5">
              {g.rows.map((r) => (
                <div key={r.label} className="flex items-center gap-3 text-sm">
                  <dt className="flex w-44 shrink-0 flex-wrap items-center gap-1">
                    {r.keys.map((k, i) => (
                      <span key={k} className="flex items-center gap-1">
                        <Kbd>{k}</Kbd>
                        {i < r.keys.length - 1 && r.keys.length > 1 && r.keys[0].length <= 4 && <span className="text-ink-4">+</span>}
                      </span>
                    ))}
                  </dt>
                  <dd className="text-ink-2">{r.label}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <p className="text-xs text-ink-3">
          Press <Kbd>Ctrl</Kbd> + <Kbd>/</Kbd> any time to open this list.
        </p>
      </div>
    </Modal>
  );
}
