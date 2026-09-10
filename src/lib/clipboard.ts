/** Copies verse text followed by its reference, e.g. "For God so loved the
 * world... (John 3:16)" -- the standard "copy verse" format most Bible apps
 * use so pasted text is self-identifying wherever it lands. */
export async function copyWithReference(text: string, reference: string): Promise<void> {
  await navigator.clipboard.writeText(`${text.trim()} (${reference})`);
}
