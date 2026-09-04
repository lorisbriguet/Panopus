import { useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Trash2 } from "lucide-react";
import {
  useCreateTag,
  useDeleteTag,
  useRenameTag,
  useTags,
  useUpdateTagColor,
  type TagRow,
} from "../../hooks/useTags";
import { useT } from "../../i18n/useT";
import {
  getStoredTagColor,
  normalizeTagColorName,
  TAG_COLOR_NAMES,
} from "../../lib/tagColors";
import { useAppStore } from "../../stores/app-store";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

interface TagManagerProps {
  open: boolean;
  onClose: () => void;
}

/** One editable row of the manager: color-cycle dot, inline rename, delete. */
function TagManagerRow({
  tag,
  confirming,
  onArmDelete,
  onDelete,
}: {
  tag: TagRow;
  confirming: boolean;
  onArmDelete: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const darkMode = useAppStore((s) => s.darkMode);
  const renameTag = useRenameTag();
  const updateColor = useUpdateTagColor();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tag.name);

  const color = getStoredTagColor(tag.color, darkMode);

  const cycleColor = () => {
    const idx = TAG_COLOR_NAMES.indexOf(normalizeTagColorName(tag.color));
    const next = TAG_COLOR_NAMES[(idx + 1) % TAG_COLOR_NAMES.length];
    updateColor.mutate({ id: tag.id, color: next });
  };

  const commitRename = () => {
    setEditing(false);
    const name = draft.trim();
    if (!name || name === tag.name) return;
    renameTag.mutate({ id: tag.id, name });
  };

  const handleRenameKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setDraft(tag.name);
      setEditing(false);
    }
  };

  return (
    <li className="flex items-center gap-2 py-1.5">
      <button
        type="button"
        onClick={cycleColor}
        aria-label={`${t.change_tag_color} ${tag.name}`}
        title={t.change_tag_color}
        className="shrink-0 w-4 h-4 rounded-full border border-[var(--color-input-border)] focus-accent"
        style={{ background: color.text }}
      />
      {editing ? (
        <Input
          fullWidth={false}
          className="w-40"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleRenameKey}
          aria-label={t.rename_tag}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(tag.name);
            setEditing(true);
          }}
          title={t.rename_tag}
          className="text-sm text-left min-w-0 truncate hover:text-accent focus-accent rounded px-0.5"
        >
          {tag.name}
        </button>
      )}
      <button
        type="button"
        onClick={confirming ? onDelete : onArmDelete}
        aria-label={`${t.delete_tag} ${tag.name}`}
        title={t.delete_tag}
        className={`ml-auto shrink-0 flex items-center gap-1 text-xs focus-accent rounded p-0.5 ${
          confirming
            ? "text-[var(--color-danger-text)] font-medium"
            : "text-muted hover:text-[var(--color-danger-text)]"
        }`}
      >
        {/* Two-click destructive confirm (no ConfirmDialog in the house kit):
            first click arms the row, second click deletes. */}
        {confirming && <span>{t.confirm_delete_tag}</span>}
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * Modal for global tag CRUD: create (palette-cycled color, like FontDetail's
 * TagEditor), inline rename, color cycling and two-click delete. Deleting the
 * tag that currently narrows the library grid also resets that filter, so the
 * grid never sticks on a tag id that no longer exists.
 */
export function TagManager({ open, onClose }: TagManagerProps) {
  const t = useT();
  const { data: tags } = useTags();
  const createTag = useCreateTag();
  const deleteTag = useDeleteTag();
  const libraryQuery = useAppStore((s) => s.libraryQuery);
  const setLibraryQuery = useAppStore((s) => s.setLibraryQuery);
  const [newTag, setNewTag] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    const name = newTag.trim();
    if (!name || createTag.isPending) return;
    if ((tags ?? []).some((tg) => tg.name.toLowerCase() === name.toLowerCase())) return;
    createTag.mutate(
      // Cycle the palette so successive new tags get distinct colors.
      { name, color: TAG_COLOR_NAMES[(tags?.length ?? 0) % TAG_COLOR_NAMES.length] },
      { onSuccess: () => setNewTag("") }
    );
  };

  const handleDelete = (id: number) => {
    setConfirmId(null);
    deleteTag.mutate(id, {
      onSuccess: () => {
        // The deleted tag may be the grid's active filter — reset it so the
        // library never filters on a tag id that no longer exists.
        if (libraryQuery.tagId === id) setLibraryQuery({ tagId: null });
      },
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={t.manage_tags}>
      <form onSubmit={handleCreate} className="flex items-center gap-2">
        <Input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder={t.new_tag_placeholder}
          aria-label={t.new_tag_placeholder}
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={newTag.trim() === ""}
          loading={createTag.isPending}
        >
          {t.add_tag_button}
        </Button>
      </form>
      {(tags ?? []).length === 0 ? (
        <p className="mt-3 text-xs text-muted">{t.no_tags_yet}</p>
      ) : (
        <ul className="mt-3 max-h-72 overflow-y-auto divide-y divide-[var(--color-border-divider)]">
          {(tags ?? []).map((tag) => (
            <TagManagerRow
              key={tag.id}
              tag={tag}
              confirming={confirmId === tag.id}
              onArmDelete={() => setConfirmId(tag.id)}
              onDelete={() => handleDelete(tag.id)}
            />
          ))}
        </ul>
      )}
    </Modal>
  );
}
