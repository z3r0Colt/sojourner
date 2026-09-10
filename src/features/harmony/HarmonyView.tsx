import { useNavigate } from "react-router-dom";
import { useBooks, useHarmonySections } from "../../api/queries";
import { useNavigationStore } from "../../state/navigationStore";

export function HarmonyView() {
  const { data: books } = useBooks();
  const { data: sections } = useHarmonySections();
  const goTo = useNavigationStore((s) => s.goTo);
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <h1 className="text-xl font-semibold">Harmony of the Gospels</h1>
      <p className="mt-1 mb-4 text-sm text-gray-500">
        The events of Christ's life in chronological order, with where each is told across Matthew, Mark, Luke and John.
      </p>
      <ol className="space-y-2">
        {sections?.map((s) => (
          <li key={s.id} className="flex items-baseline gap-3 border-b border-gray-100 py-2 text-sm dark:border-gray-900">
            <span className="w-7 shrink-0 text-right text-xs text-gray-400">{s.sort_order}.</span>
            <div>
              <div className="font-medium">{s.title}</div>
              <div className="mt-0.5 space-x-2">
                {s.readings.map((r, i) => {
                  const name = books?.find((b) => b.id === r.book_id)?.name ?? `#${r.book_id}`;
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        goTo({ bookId: r.book_id, chapter: r.chapter_start, verse: r.verse_start ?? undefined });
                        navigate("/");
                      }}
                      className="text-blue-600 hover:underline dark:text-blue-400"
                      title={`${name} ${r.label}`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
