import type { CommentarySource } from "../../api/types";

/** A commentary picker's options: the shipped commentaries, then those the
 * reader added themselves under a heading of their own. With none added the
 * list stays flat, as it always was. */
export function CommentarySourceOptions({ sources }: { sources: CommentarySource[] | undefined }) {
  const option = (s: CommentarySource) => (
    <option key={s.id} value={s.id}>
      {s.title}
    </option>
  );
  const shipped = (sources ?? []).filter((s) => !s.user_provided);
  const own = (sources ?? []).filter((s) => s.user_provided);
  if (own.length === 0) return <>{shipped.map(option)}</>;
  return (
    <>
      {shipped.length > 0 && <optgroup label="Included">{shipped.map(option)}</optgroup>}
      <optgroup label="User provided">{own.map(option)}</optgroup>
    </>
  );
}
