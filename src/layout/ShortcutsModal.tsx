import { Modal } from "../components/ui/Modal";
import { Kbd } from "../components/ui/Page";

const GROUPS: { title: string; rows: { keys: string[]; label: string }[] }[] = [
  {
    title: "Navigate",
    rows: [
      { keys: ["Ctrl", "K"], label: "Go to a reference, Strong's number, or term" },
      { keys: ["Ctrl", "F"], label: "Search everything" },
      { keys: ["Ctrl", "["], label: "Previous chapter" },
      { keys: ["Ctrl", "]"], label: "Next chapter" },
      { keys: ["Alt", "←"], label: "Back in reading history" },
      { keys: ["Alt", "→"], label: "Forward in reading history" },
    ],
  },
  {
    title: "Reading",
    rows: [
      { keys: ["Ctrl", "B"], label: "Show or hide the study panel" },
      { keys: ["Ctrl", "D"], label: "Bookmark the current chapter or verse" },
      { keys: ["F11"], label: "Focus mode (text only)" },
      { keys: ["Esc"], label: "Close any panel, menu, or dialog" },
    ],
  },
  {
    title: "Text",
    rows: [
      { keys: ["Click a verse"], label: "Select it: the study panel follows the selected verse" },
      { keys: ["Right-click a verse"], label: "Highlight, note, copy, compare, memorize, or bookmark" },
      { keys: ["Select text"], label: "Highlight or annotate just that span" },
      { keys: ["Hover a reference"], label: "Preview the passage; Tab to a reference does the same. Esc closes it" },
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
