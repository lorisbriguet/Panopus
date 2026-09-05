import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo } from "react";
import { Grip, X } from "lucide-react";
import { Toggle } from "../ui/Toggle";
import { useSetActive } from "../../hooks/useActivation";
import { useT } from "../../i18n/useT";
import { DEFAULT_PROOF_TEXT } from "../../stores/app-store";
import type { FontRow } from "../../lib/fontFilters";
import { ensureFontFace } from "./FontFaceLoader";

interface SortableRowProps {
  fontId: number;
  font: FontRow;
  proofText: string;
  proofSize: number;
  onUnpin: () => void;
}

/**
 * A draggable/sortable row in the compare table. Uses @dnd-kit/sortable.
 * The grip handle is visible on hover; drag to reorder.
 */
export const SortableRow = memo(function SortableRow({
  fontId,
  font,
  proofText,
  proofSize,
  onUnpin,
}: SortableRowProps) {
  const t = useT();
  const setActive = useSetActive();
  const isSystem = font.is_system === 1;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: fontId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Ensure the font face is registered (idempotent)
  const family = ensureFontFace(fontId, font.path);

  // Same fallback as Waterfall: an all-whitespace proof line renders nothing,
  // so substitute the default pangram. Fonts without Latin letters override
  // both with their indexed specimen (sample_text) — the proof text would
  // render blank in them.
  const text =
    font.sample_text ?? (proofText.trim() === "" ? DEFAULT_PROOF_TEXT : proofText);

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b border-[var(--color-border-divider)] hover:bg-[var(--color-hover-row)]"
    >
      {/* Drag handle */}
      <td className="px-2 py-2 text-center">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted hover:text-[var(--color-text)] focus-accent rounded p-0.5 inline-flex"
          aria-label={t.drag_reorder}
        >
          <Grip size={16} aria-hidden="true" />
        </button>
      </td>

      {/* Font info: family / style */}
      <td className="px-4 py-3">
        <div className="text-sm font-medium">{font.family}</div>
        <div className="text-xs text-muted">{font.style}</div>
      </td>

      {/* Proof text in the font */}
      <td className="px-4 py-3">
        <div
          className="min-w-0 overflow-hidden break-words text-sm leading-tight"
          style={{
            fontFamily: family,
            fontSize: proofSize,
          }}
        >
          {text}
        </div>
      </td>

      {/* Activation toggle */}
      <td className="px-3 py-3 text-center">
        <span title={isSystem ? t.system_font_locked : undefined}>
          <Toggle
            checked={font.active === 1}
            disabled={isSystem}
            onChange={(checked) =>
              setActive.mutate({ ids: [fontId], active: checked })
            }
            ariaLabel={t.font_active}
          />
        </span>
      </td>

      {/* Unpin button */}
      <td className="px-2 py-3 text-center">
        <button
          type="button"
          onClick={onUnpin}
          aria-label={t.unpin_font}
          className="focus-accent rounded p-0.5 text-muted hover:text-[var(--color-text)]"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
});
