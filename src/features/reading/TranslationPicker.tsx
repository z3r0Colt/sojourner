import { Fragment } from "react";
import { ChevronDown } from "lucide-react";
import type { Translation } from "../../api/types";
import { Popover, PopoverItem, PopoverLabel } from "../../components/ui/Popover";
import { cx, selectSmClass } from "../../components/ui/classes";
import { groupTranslations, translationOptionLabel } from "./translationGroups";

/**
 * The Bible toolbar's choice of translation, on a desk: a button that shows
 * the code of the one being read, and a menu that gives every translation's
 * code and its name, under the heading it belongs to.
 *
 * The dropdown it replaces listed twenty-one codes (DBY, WBS, UST…) and kept
 * the names for a tooltip: a newcomer could not tell Darby from Webster
 * without hovering over each. A native dropdown cannot show one thing closed
 * and another open, and widening it to hold the names pushed the rest of
 * the toolbar out of a narrow pane (see ReadingToolbar). A menu can be as
 * wide as its names while the button stays as wide as a code.
 *
 * A phone keeps the native dropdown, whose wheel is the better thing to
 * touch.
 */
export function TranslationPicker({ translations, value, onChange }: { translations: Translation[]; value: number | null; onChange: (id: number) => void }) {
  const current = translations.find((t) => t.id === value);
  return (
    <Popover
      width="w-96"
      align="left"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={current ? `Translation: ${current.name}. Choose another` : "Choose a translation"}
          aria-haspopup="menu"
          aria-expanded={open}
          title={current ? (current.scope ? `${current.name} (${current.scope})` : current.name) : undefined}
          className={cx(selectSmClass, "inline-flex shrink-0 items-center gap-1 whitespace-nowrap hover:bg-hover", open && "border-accent")}
        >
          {current ? translationOptionLabel(current) : "Translation"}
          <ChevronDown className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
        </button>
      )}
    >
      {(close) =>
        groupTranslations(translations).map((g) => (
          <Fragment key={g.label}>
            <PopoverLabel>{g.label}</PopoverLabel>
            {g.translations.map((t) => (
              <PopoverItem
                key={t.id}
                selected={t.id === value}
                onClick={() => {
                  onChange(t.id);
                  close();
                }}
              >
                <span className="w-24 shrink-0 whitespace-nowrap font-mono text-xs text-ink-3">{translationOptionLabel(t)}</span>
                <span className="min-w-0 truncate" title={t.name}>
                  {t.name}
                </span>
              </PopoverItem>
            ))}
          </Fragment>
        ))
      }
    </Popover>
  );
}
