import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { confirmDelete } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";
import { cx, inputSmClass } from "../../components/ui/classes";
import { RichTextEditor } from "./RichTextEditor";
import { DEFAULT_NOTE_TEMPLATES, isEmptyNoteHtml, templatesAreDefault, useNoteTemplates, type NoteTemplate } from "./noteTemplates";

/** Settings → Reading → Note templates: rename inline, reorder with the
 * arrows, edit a template's sections in the note editor, add or delete
 * one, and reset to the shipped set. Every change is saved at once. */
export function NoteTemplatesEditor() {
  const [templates, setTemplates] = useNoteTemplates();
  const [editing, setEditing] = useState<{ index: number | null; template: NoteTemplate } | null>(null);

  function save(next: NoteTemplate[], message = "Note templates saved") {
    setTemplates(next);
    toast.success(message);
  }

  function rename(index: number, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === templates[index].name) return;
    save(templates.map((t, i) => (i === index ? { ...t, name: trimmed } : t)));
  }

  function move(index: number, delta: -1 | 1) {
    const to = index + delta;
    if (to < 0 || to >= templates.length) return;
    const next = [...templates];
    [next[index], next[to]] = [next[to], next[index]];
    save(next);
  }

  async function remove(index: number) {
    if (!(await confirmDelete(`the “${templates[index].name}” template`, "Notes already written from it are not affected."))) return;
    save(
      templates.filter((_, i) => i !== index),
      "Template deleted",
    );
  }

  return (
    <div className="space-y-2">
      {templates.length === 0 && <p className="text-sm text-ink-3">No templates. Add one, or reset to the shipped set.</p>}
      <ul className="space-y-1">
        {templates.map((t, i) => (
          <li key={`${i}-${t.name}`} className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1">
            <TemplateNameInput name={t.name} onCommit={(name) => rename(i, name)} />
            <IconButton icon={ChevronUp} label={`Move “${t.name}” up`} size="sm" disabled={i === 0} onClick={() => move(i, -1)} />
            <IconButton icon={ChevronDown} label={`Move “${t.name}” down`} size="sm" disabled={i === templates.length - 1} onClick={() => move(i, 1)} />
            <IconButton icon={Pencil} label={`Edit the sections of “${t.name}”`} size="sm" onClick={() => setEditing({ index: i, template: t })} />
            <IconButton icon={Trash2} label={`Delete “${t.name}”`} size="sm" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => remove(i)} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={Plus} onClick={() => setEditing({ index: null, template: { name: "", html: "<h3>Heading</h3><p></p>" } })}>
          Add template
        </Button>
        {!templatesAreDefault(templates) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => save([...DEFAULT_NOTE_TEMPLATES], "Note templates reset")}
          >
            Reset to defaults
          </Button>
        )}
      </div>

      {editing && (
        <TemplateModal
          template={editing.template}
          isNew={editing.index === null}
          onSave={(t) => {
            const next = editing.index === null ? [...templates, t] : templates.map((x, i) => (i === editing.index ? t : x));
            save(next, editing.index === null ? "Template added" : "Template saved");
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** Inline name box: commits on blur or Enter, Escape restores. */
function TemplateNameInput({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  return (
    <input
      type="text"
      value={draft}
      aria-label={`Template name: ${name}`}
      maxLength={60}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(draft);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(name);
        }
      }}
      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-ink hover:border-line-2 focus:border-accent"
    />
  );
}

function TemplateModal({ template, isNew, onSave, onClose }: { template: NoteTemplate; isNew: boolean; onSave: (t: NoteTemplate) => void; onClose: () => void }) {
  const [name, setName] = useState(template.name);
  const [html, setHtml] = useState(template.html);
  const dirty = name !== template.name || html !== template.html;
  const valid = name.trim().length > 0 && !isEmptyNoteHtml(html);

  return (
    <Modal
      title={isNew ? "New note template" : `Edit “${template.name}”`}
      onClose={onClose}
      dirty={dirty}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={() => onSave({ name: name.trim(), html })}>
            {isNew ? "Add template" : "Save template"}
          </Button>
        </>
      }
    >
      <label className="mb-3 block">
        <span className="mb-1 block text-xs font-medium text-ink-3">Name</span>
        <input autoFocus={isNew} type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Word study" className={cx(inputSmClass, "w-full")} />
      </label>
      <span className="mb-1 block text-xs font-medium text-ink-3">Sections</span>
      <RichTextEditor content={html} onChange={setHtml} offerTemplates={false} placeholder="The headings and text a new note starts with…" />
      <p className="mt-2 text-xs text-ink-3">Type a heading as “### Heading” on its own line. Everything here is copied into a new note when the template is chosen.</p>
    </Modal>
  );
}
