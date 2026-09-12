import { TemplatesEditor } from "../notes/NoteTemplatesEditor";
import { DEFAULT_SERMON_TEMPLATES, useSermonTemplates } from "./sermonTemplates";

/** Settings → Reading → Sermon templates (SB1.6): the same editor the note
 * templates use, over the sermon list and the document-mode editor, so a
 * template can hold points and sub-points. */
export function SermonTemplatesEditor() {
  const [templates, setTemplates] = useSermonTemplates();
  return (
    <TemplatesEditor
      templates={templates}
      setTemplates={setTemplates}
      defaults={DEFAULT_SERMON_TEMPLATES}
      noun="Sermon template"
      mode="document"
      newTemplateHtml="<h2>Introduction</h2><p></p>"
      hint="Ctrl+Alt+1 makes a point and Ctrl+Alt+2 a sub-point. Everything here is copied into a new manuscript when the template is chosen."
    />
  );
}
