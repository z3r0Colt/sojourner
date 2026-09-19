import { useTranslations } from "../../api/queries";
import { useReaderTranslationId } from "../../state/workspaceStore";
import { selectSmClass } from "../../components/ui/classes";

/** The translation a memory card is learned in, shown as its code and
 * changed in place. A card with none pinned follows the reader's Bible
 * pane, and says which one that is right now. */
export function TranslationPick({ value, onChange }: { value: number | null; onChange: (translationId: number | null) => void }) {
  const { data: translations } = useTranslations();
  const readerId = useReaderTranslationId();
  const readerCode = translations?.find((t) => t.id === readerId)?.code;
  return (
    <select
      aria-label="Translation this card is learned in"
      title="The translation this card is learned in"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className={selectSmClass}
    >
      <option value="">{readerCode ? `Reader's (${readerCode})` : "Reader's translation"}</option>
      {translations?.map((t) => (
        <option key={t.id} value={t.id}>
          {t.code}
        </option>
      ))}
    </select>
  );
}

/** "KJV", or the reader's current code when the card follows the reader. */
export function useTranslationCode(translationId: number | null): string | null {
  const { data: translations } = useTranslations();
  const readerId = useReaderTranslationId();
  return translations?.find((t) => t.id === (translationId ?? readerId))?.code ?? null;
}
