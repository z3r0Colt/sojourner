import type { MemoryMode } from "../../api/types";
import { selectClass, selectSmClass } from "../../components/ui/classes";

export const MEMORY_MODE_LABELS: Record<MemoryMode, string> = {
  "first-letter": "First letter",
  "blank-word": "Blank word",
  "type-it": "Type it",
};

/** The First Letter / Blank Word / Type It practice-mode picker -- shared
 * between Scripture Memory and Catechism Study so the two decks (same SM-2
 * engine, same three modes) don't drift into two slightly different
 * dropdowns. `small` matches the compact per-row select used in each deck's
 * list; omit it for the larger "add card" form select. */
export function MemoryModeSelect({
  value,
  onChange,
  small,
}: {
  value: MemoryMode;
  onChange: (mode: MemoryMode) => void;
  small?: boolean;
}) {
  return (
    <select aria-label="Practice mode" value={value} onChange={(e) => onChange(e.target.value as MemoryMode)} className={small ? selectSmClass : selectClass}>
      {(Object.keys(MEMORY_MODE_LABELS) as MemoryMode[]).map((m) => (
        <option key={m} value={m}>
          {MEMORY_MODE_LABELS[m]}
        </option>
      ))}
    </select>
  );
}
