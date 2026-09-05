import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMemo } from "react";
import { EmptyState, PageHeader, PageSpinner } from "../components/ui";
import { useFonts } from "../hooks/useFonts";
import { useAppStore } from "../stores/app-store";
import { useT } from "../i18n/useT";
import { SortableRow } from "../components/fonts/SortableRow";

export function ComparePage() {
  const t = useT();
  const { data: rows, isLoading } = useFonts();
  const pinnedIds = useAppStore((s) => s.pinnedIds);
  const setPinnedIds = useAppStore((s) => s.setPinnedIds);
  const unpinFont = useAppStore((s) => s.unpinFont);
  const proofText = useAppStore((s) => s.proofText);
  const proofSize = useAppStore((s) => s.proofSize);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Map row ids by id for fast lookup
  const rowMap = useMemo(
    () => new Map((rows ?? []).map((r) => [r.id, r])),
    [rows]
  );

  // Filter pinnedIds to only include fonts still in the library
  const visiblePinnedIds = useMemo(
    () => pinnedIds.filter((id) => rowMap.has(id)),
    [pinnedIds, rowMap]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = visiblePinnedIds.indexOf(active.id as number);
    const newIndex = visiblePinnedIds.indexOf(over.id as number);

    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(visiblePinnedIds, oldIndex, newIndex);
    setPinnedIds(newOrder);
  };

  // While the fonts query is loading, every pin looks "removed" — show a
  // spinner instead of a misleading empty state (same pattern as LibraryPage).
  if (isLoading) {
    return (
      <>
        <PageHeader title={t.compare} />
        <PageSpinner label={t.loading_fonts} />
      </>
    );
  }

  if (visiblePinnedIds.length === 0) {
    return (
      <>
        <PageHeader title={t.compare} />
        <EmptyState message={t.compare_empty} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t.compare} />
      {/* DndContext lives OUTSIDE the table: it renders an inline a11y
          announcement <div>, which is invalid DOM inside <table>. */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={visiblePinnedIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border-divider)]">
              <th className="w-8 px-3 py-2 text-left text-xs font-medium text-muted"></th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                {t.compare_font}
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                {t.compare_proof}
              </th>
              <th className="w-16 px-3 py-2 text-center text-xs font-medium text-muted">
                {t.compare_active}
              </th>
              <th className="w-8 px-3 py-2"></th>
            </tr>
          </thead>
              <tbody>
                {visiblePinnedIds.map((fontId) => {
                  const font = rowMap.get(fontId);
                  if (!font) return null;

                  return (
                    <SortableRow
                      key={fontId}
                      fontId={fontId}
                      font={font}
                      proofText={proofText}
                      proofSize={proofSize}
                      onUnpin={() => unpinFont(fontId)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}
