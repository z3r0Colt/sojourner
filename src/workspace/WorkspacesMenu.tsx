import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { Check, Layers, Pencil, Save, Trash } from "lucide-react";
import { useCommentarySources } from "../api/queries";
import { useSetting } from "../hooks/useSetting";
import { Button, IconButton } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Popover, PopoverItem, PopoverLabel } from "../components/ui/Popover";
import { confirmDelete } from "../components/ui/confirm";
import { toast } from "../components/ui/toast";
import { cx, inputClass } from "../components/ui/classes";
import { layoutMeta } from "./layouts";
import { LayoutPictogram } from "./LayoutPicker";
import { PANE_KINDS } from "./paneKinds";
import { PRESET_WORKSPACES, WORKSPACES_SETTING, applyWorkspace, captureWorkspace, isPresetName, sanitizeSavedWorkspaces, type SavedWorkspace } from "./presets";

/**
 * The Workspaces menu in the top bar: presets, the reader's saved
 * workspaces (apply, rename, delete), and "Save current as…". The name
 * dialog is a small store so the palette's "Save workspace as…" command
 * can open it from anywhere; `WorkspaceDialogs` renders it in the shell.
 */

const NONE: SavedWorkspace[] = [];

/** The reader's saved workspaces, stored through the settings API. */
export function useSavedWorkspaces(): [SavedWorkspace[], (next: SavedWorkspace[]) => void] {
  const [raw, setRaw] = useSetting<SavedWorkspace[]>(WORKSPACES_SETTING, NONE);
  const list = useMemo(() => sanitizeSavedWorkspaces(raw), [raw]);
  return [list, setRaw];
}

interface DialogState {
  /** Rename `renaming`, or save the current workspace when null. */
  open: boolean;
  renaming: string | null;
  openSaveAs: () => void;
  openRename: (name: string) => void;
  close: () => void;
}

export const useWorkspaceDialog = create<DialogState>((set) => ({
  open: false,
  renaming: null,
  openSaveAs: () => set({ open: true, renaming: null }),
  openRename: (name) => set({ open: true, renaming: name }),
  close: () => set({ open: false, renaming: null }),
}));

function NameDialog({ saved, setSaved }: { saved: SavedWorkspace[]; setSaved: (next: SavedWorkspace[]) => void }) {
  const renaming = useWorkspaceDialog((s) => s.renaming);
  const close = useWorkspaceDialog((s) => s.close);
  const [name, setName] = useState(renaming ?? "");
  useEffect(() => setName(renaming ?? ""), [renaming]);
  const trimmed = name.trim();
  const clashesPreset = isPresetName(trimmed);
  const replaces = !renaming && saved.some((w) => w.name === trimmed);
  const canSave = trimmed.length > 0 && !clashesPreset && (!renaming || trimmed !== renaming);

  function submit() {
    if (!canSave) return;
    if (renaming) {
      if (saved.some((w) => w.name === trimmed)) {
        toast.error(`A workspace named “${trimmed}” already exists.`);
        return;
      }
      setSaved(saved.map((w) => (w.name === renaming ? { ...w, name: trimmed } : w)));
      toast.success(`Renamed to “${trimmed}”`);
    } else {
      const captured = captureWorkspace(trimmed);
      setSaved(replaces ? saved.map((w) => (w.name === trimmed ? captured : w)) : [...saved, captured]);
      toast.success(replaces ? `Updated workspace “${trimmed}”` : `Saved workspace “${trimmed}”`);
    }
    close();
  }

  return (
    <Modal
      title={renaming ? "Rename workspace" : "Save workspace"}
      onClose={close}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!canSave}>
            {renaming ? "Rename" : replaces ? "Replace" : "Save"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-2"
      >
        <label className="block text-sm text-ink-2" htmlFor="workspace-name">
          {renaming ? "New name" : "Name for the current panes and layout"}
        </label>
        <input id="workspace-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning reading" className={cx(inputClass, "w-full")} />
        {clashesPreset && <p className="text-xs text-danger">That name belongs to a preset. Choose another.</p>}
        {replaces && !clashesPreset && <p className="text-xs text-ink-3">A workspace with this name exists; saving replaces it.</p>}
      </form>
    </Modal>
  );
}

/** Mount once in the shell. */
export function WorkspaceDialogs() {
  const open = useWorkspaceDialog((s) => s.open);
  const [saved, setSaved] = useSavedWorkspaces();
  if (!open) return null;
  return <NameDialog saved={saved} setSaved={setSaved} />;
}

function summary(w: SavedWorkspace): string {
  return w.description ?? `${layoutMeta(w.layout).label} · ${w.panes.map((p) => PANE_KINDS[p.kind]?.label ?? p.kind).join(", ")}`;
}

function WorkspaceRow({ w, onApply, actions }: { w: SavedWorkspace; onApply: () => void; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5">
      <PopoverItem onClick={onApply} className="min-w-0 flex-1">
        <LayoutPictogram id={w.layout} className="text-ink-3" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink">{w.name}</span>
          <span className="block truncate text-xs text-ink-3">{summary(w)}</span>
        </span>
      </PopoverItem>
      {actions}
    </div>
  );
}

export function WorkspacesMenu() {
  const [saved, setSaved] = useSavedWorkspaces();
  const { data: commentarySources } = useCommentarySources();
  const openSaveAs = useWorkspaceDialog((s) => s.openSaveAs);
  const openRename = useWorkspaceDialog((s) => s.openRename);

  function apply(w: SavedWorkspace) {
    applyWorkspace(w, commentarySources);
    toast.info(`Workspace: ${w.name}`);
  }

  async function remove(w: SavedWorkspace) {
    if (!(await confirmDelete(`the workspace “${w.name}”`, "Your panes stay as they are; only the saved arrangement is removed."))) return;
    setSaved(saved.filter((x) => x.name !== w.name));
    toast.success(`Deleted workspace “${w.name}”`);
  }

  return (
    <Popover
      width="w-80"
      trigger={({ toggle, open }) => (
        <Button variant="ghost" icon={Layers} onClick={toggle} active={open} aria-haspopup="menu" aria-expanded={open} title="Switch, save, or manage workspaces">
          Workspaces
        </Button>
      )}
    >
      {(close) => (
        <>
          <PopoverLabel>Presets</PopoverLabel>
          {PRESET_WORKSPACES.map((w) => (
            <WorkspaceRow
              key={w.name}
              w={w}
              onApply={() => {
                apply(w);
                close();
              }}
            />
          ))}
          <PopoverLabel>Saved</PopoverLabel>
          {saved.length === 0 && <p className="px-2 pb-1.5 text-xs text-ink-3">Nothing saved yet. Arrange your panes, then save them under a name below.</p>}
          {saved.map((w) => (
            <WorkspaceRow
              key={w.name}
              w={w}
              onApply={() => {
                apply(w);
                close();
              }}
              actions={
                <>
                  <IconButton
                    icon={Pencil}
                    label={`Rename ${w.name}`}
                    size="sm"
                    onClick={() => {
                      openRename(w.name);
                      close();
                    }}
                  />
                  <IconButton
                    icon={Trash}
                    label={`Delete ${w.name}`}
                    size="sm"
                    onClick={() => {
                      close();
                      void remove(w);
                    }}
                  />
                </>
              }
            />
          ))}
          <div className="my-1 h-px bg-line" aria-hidden="true" />
          <PopoverItem
            onClick={() => {
              openSaveAs();
              close();
            }}
          >
            <Save className="h-4 w-4 text-ink-3" aria-hidden="true" /> Save current as…
          </PopoverItem>
          <p className="flex items-start gap-1.5 px-2 pb-1 pt-1.5 text-xs text-ink-3">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Switching keeps the chapter you are reading in each Bible pane that shares a link group. Saved workspaces travel with backups.
          </p>
        </>
      )}
    </Popover>
  );
}
