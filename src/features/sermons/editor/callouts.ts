/**
 * Typed blocks: a paragraph or more set apart as the explanation, the
 * illustration, the application, a transition, or a kind the writer names.
 *
 * A sermon's parts are not all the same kind of speech, and a preacher
 * scanning a manuscript -- at the desk or in the pulpit -- looks for them by
 * kind: "where is my application for this point?" Each kind has its own
 * color (the `--callout-*` tokens in styles.css), and the saved HTML says
 * which kind it is, so preaching mode, print, and the podium file show the
 * same thing the editor does.
 */

import { escapeHtml } from "../../../lib/escapeHtml";

export type CalloutKind = "explanation" | "illustration" | "application" | "transition" | "custom";

export const CALLOUT_KINDS: readonly CalloutKind[] = ["explanation", "illustration", "application", "transition", "custom"];

export const CALLOUT_LABEL: Record<CalloutKind, string> = {
  explanation: "Explanation",
  illustration: "Illustration",
  application: "Application",
  transition: "Transition",
  custom: "Custom",
};

export function isCalloutKind(value: unknown): value is CalloutKind {
  return typeof value === "string" && (CALLOUT_KINDS as readonly string[]).includes(value);
}

/** What the block's chip says: the kind's name, or the writer's own name
 * for a custom block. */
export function calloutTitle(kind: CalloutKind, label: string | null | undefined): string {
  if (kind === "custom") return label?.trim() || CALLOUT_LABEL.custom;
  return CALLOUT_LABEL[kind];
}

/** The markup one typed block saves as, for templates and anything else that
 * builds a manuscript as HTML rather than through editor commands. `inner`
 * is HTML; an empty block gets one empty paragraph to type into. */
export function calloutBlockHtml(kind: CalloutKind, inner = "<p></p>", label?: string): string {
  const labelAttr = kind === "custom" && label ? ` data-label="${escapeHtml(label)}"` : "";
  return `<aside data-type="callout" data-kind="${kind}"${labelAttr}>${inner || "<p></p>"}</aside>`;
}
