import { Modal } from "../../components/ui/Modal";
import { COLOR_CATEGORIES, COLOR_FAMILIES, colorStyle } from "./colorText";

/** Words that show each category, as the reader will meet them. */
const EXAMPLES: Record<string, string> = {
  GF: "God, LORD, Almighty, his (of God)",
  GS: "Jesus, Christ, Lamb, Son of man",
  HS: "Spirit, Holy Ghost, Comforter",
  AN: "angel, cherubims, Michael",
  DE: "Satan, devils, Baal, idols",
  PN: "David, Mary, Paul",
  PG: "Levites, Pharisees, children of Israel",
  GP: "man, king, servant, disciples",
  PR: "he, they, thy (of people)",
  BE: "sheep, lion, dove",
  PL: "vine, fig tree, wheat",
  PP: "Jerusalem, Jordan, Egypt",
  L1: "city, house, wilderness, earth",
  L2: "up, there, before (in front of)",
  T1: "day, sabbath, year, Passover",
  T2: "when, then, came to pass",
  NU: "seven, twelve, first",
  ME: "cubit, shekel, talent",
  QU: "all, many, every",
};

/** "What the colors mean": the five questions, the nineteen colors, who is
 * speaking, and what the reader can do with them. Opened from the Color
 * text button's menu and from the strip under the toolbar. */
export function ColorTextGuide({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Color text: what the colors mean" onClose={onClose} size="lg">
      <div className="space-y-4 text-sm text-ink-2">
        <p>
          Color text answers the questions a reader brings to a passage: <b>Who? What? Where? When? How many?</b> Every person, place, time and
          number is colored by what it is. The brightest shade of a family is the most specific word (“Jerusalem”), darker shades are general words
          (“city”), and the darkest the small words (“there”). Verbs, objects and ideas stay black.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {COLOR_FAMILIES.map((f) => (
            <section key={f.family} className="rounded-lg border border-line p-3">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
                {f.question} <span style={{ color: `var(--ct-${f.swatch})` }}>{f.label}</span>
              </h3>
              <ul className="space-y-1">
                {COLOR_CATEGORIES.filter((c) => c.family === f.family).map((c) => (
                  <li key={c.code} className="flex items-baseline gap-2">
                    <span aria-hidden="true" className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `var(--ct-${c.code})` }} />
                    <span>
                      <span className="ct reading-font font-medium" style={colorStyle(c.code)}>
                        {c.name}
                      </span>
                      <span className="block text-xs text-ink-3">{EXAMPLES[c.code]}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <section className="rounded-lg border border-line p-3">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Who's speaking</h3>
            <ul className="reading-font space-y-1 text-ink">
              <li>
                <span className="voice-god">God speaking</span> <span className="font-sans text-xs text-ink-3">in small capitals</span>
              </li>
              <li>
                <span className="voice-quote">Scripture quoted in a speech</span> <span className="font-sans text-xs text-ink-3">in italics</span>
              </li>
              <li>
                <span className="voice-inner">speech within speech</span> <span className="font-sans text-xs text-ink-3">a shade lighter</span>
              </li>
              <li>
                <span className="text-red-700 dark:text-red-400">the words of Jesus</span>{" "}
                <span className="font-sans text-xs text-ink-3">in red, with Words of Jesus in red on</span>
              </li>
            </ul>
          </section>
        </div>
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Using it</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Click a colored word for what it is, every verse where it has that color, and the person or place in the Factbook and on the map.</li>
            <li>
              <b>In this chapter</b>, beside the colors, lists everyone and everywhere the chapter names; pick one to ring it wherever it stands.
            </li>
            <li>Click a family to hide or show it. The thin bar above them shows how much of each the chapter holds.</li>
            <li>
              Search with <code className="rounded bg-surface-2 px-1">tag:son</code>, <code className="rounded bg-surface-2 px-1">tag:places</code> or{" "}
              <code className="rounded bg-surface-2 px-1">speaker:god</code> to find verses by what they name or who speaks.
            </li>
            <li>
              It works in every translation: the KJV's coloring is carried to the others word by word, and to the Greek and Hebrew through Strong's
              numbers.
            </li>
            <li>
              Settings → Reading can underline each family in its own style, for telling the colors apart without seeing them, and color sermon
              passages and family worship too.
            </li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
