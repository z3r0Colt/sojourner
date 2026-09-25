import { BookOpen, ScrollText } from "lucide-react";
import { useResources } from "../../api/queries";
import { openContent, targetFor } from "../../workspace/openContent";
import { linkClass } from "../../components/ui/classes";

/** Plain counsel for a family that has never done this, most of it what the
 * Directory for Family-Worship (1647) and the old guides say, put simply. */
export const GUIDE_POINTS: { title: string; body: string }[] = [
  {
    title: "Keep it short",
    body: "Ten or fifteen minutes is enough. A short time kept most days does more good than a long one kept now and then.",
  },
  {
    title: "You don't need to preach",
    body: "Read the passage clearly, talk about it for a minute, and pray simply. The Directory for Family-Worship asks the head of the house to read the Scriptures to the family and then to talk over what was read; the three questions under each reading are there to start that.",
  },
  {
    title: "Choose a time you already share",
    body: "After supper, or before bed. Put the Bible where you will see it, and begin at the same point each day.",
  },
  {
    title: "Everyone takes part",
    body: "The youngest can answer the catechism question; older children can read aloud; each can name someone to pray for.",
  },
  {
    title: "Missed a day? Just gather the next",
    body: "Nothing here counts streaks or tells you that you are behind. The reading and the catechism wait where you left them.",
  },
  {
    title: "Sing, even if you can't",
    body: "Press Play on the Sing step to hear the tune and sing along. If singing is too much at first, read the psalm aloud together.",
  },
  {
    title: "When you don't know what to pray",
    body: "The Pray step gives an order to follow, and the Lord's Prayer to pray together.",
  },
];

export function FamilyGuide({ columns }: { columns?: boolean }) {
  return (
    <ul className={columns ? "grid gap-x-6 gap-y-3 sm:grid-cols-2" : "space-y-3"}>
      {GUIDE_POINTS.map((p) => (
        <li key={p.title}>
          <p className="text-sm font-medium text-ink">{p.title}</p>
          <p className="text-sm text-ink-2">{p.body}</p>
        </li>
      ))}
    </ul>
  );
}

/** The two classic helps, opened where they live: the Directory in the
 * Confessions, Alexander's book in Resources when the library holds it. */
export function FurtherReading() {
  const { data: resources } = useResources();
  const alexander = resources?.find((r) => /thoughts on family.worship/i.test(r.title));
  return (
    <ul className="space-y-2 text-sm">
      <li className="flex items-start gap-2">
        <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />
        <span>
          <button
            type="button"
            className={linkClass}
            onClick={(e) => openContent("westminster", { docCode: "dfw", sectionId: null }, { target: targetFor(e, "new") })}
          >
            The Directory for Family-Worship
          </button>
          <span className="text-ink-3"> (Church of Scotland, 1647): fourteen short directions, beside the Westminster Standards in Confessions.</span>
        </span>
      </li>
      <li className="flex items-start gap-2">
        <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />
        <span>
          {alexander ? (
            <button type="button" className={linkClass} onClick={(e) => openContent("resource", { id: alexander.id }, { target: targetFor(e, "new") })}>
              Thoughts on Family-Worship
            </button>
          ) : (
            <span className="font-medium text-ink">Thoughts on Family-Worship</span>
          )}
          <span className="text-ink-3">
            {" "}
            by James W. Alexander (1847): why a household should worship together, and how.
            {!alexander && " It is on the Puritan and Reformed shelf; install or update it from Settings → Book library."}
          </span>
        </span>
      </li>
      <li className="flex items-start gap-2">
        <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />
        <span>
          <button
            type="button"
            className={linkClass}
            onClick={(e) => openContent("westminster", { docCode: "cyc", sectionId: null }, { target: targetFor(e, "new") })}
          >
            The Catechism for Young Children
          </button>
          <span className="text-ink-3"> (Joseph P. Engles, 1840): all 145 questions, to read ahead or look back.</span>
        </span>
      </li>
    </ul>
  );
}
