import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FontCard } from "./FontCard";
import { FontListRow } from "./FontListRow";
import { CollapsedFamilyGroup, FamilyGroupHeader } from "./FamilyGroup";
import {
  chunkGrid,
  flattenLibrary,
  type GridItem,
  type LibraryItem,
} from "../../lib/libraryItems";
import { gridTemplateForCount } from "../../lib/gridColumns";
import { useAppStore } from "../../stores/app-store";
import type { FontRow } from "../../lib/fontFilters";
import type { FamilyGroup } from "../../lib/familyGroups";

interface LibraryListProps {
  /** groupByFamily output, already filtered + sorted by the page. */
  entries: (FontRow | FamilyGroup)[];
  proofText: string;
  proofSize: number;
  onOpenDetail?: (id: number) => void;
}

/** Minimum card width the "auto" column mode fits (gridColumns' 340px track). */
const AUTO_MIN_CARD = 340;

/**
 * The virtualized library body (both views). The root cause of seconds-long
 * font loads was 7'499 mounted rows: every @font-face arrival invalidated
 * style+layout across that whole DOM. Virtualizing keeps only the visible
 * window mounted (~30 rows), so the same pipeline costs milliseconds.
 *
 * The scroll parent is MainLayout's page container (`data-scroll-container`)
 * — the library keeps scrolling under the sticky-ish header/toolbar exactly
 * as before; `scrollMargin` maps the list's offset inside that container.
 * Each virtual item is ONE visual row: a FontListRow in list view, or a
 * chunked cell row / expanded-family header band in grid view
 * (lib/libraryItems). The page-level expandedFamilies subscription is the
 * point: a fold flip re-renders this component, and the virtualizer only
 * ever materializes the visible items.
 */
export function LibraryList({
  entries,
  proofText,
  proofSize,
  onOpenDetail,
}: LibraryListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const libraryView = useAppStore((s) => s.libraryView);
  const libraryColumns = useAppStore((s) => s.libraryColumns);
  const expandedFamilies = useAppStore((s) => s.expandedFamilies);
  const isList = libraryView === "list";

  // "auto" columns: derive the concrete per-row count from the container
  // width (the virtual rows chunk cells at a KNOWN count — CSS auto-fill
  // could disagree with the chunker and wrap a row).
  const [autoPerRow, setAutoPerRow] = useState(1);
  useLayoutEffect(() => {
    if (isList || libraryColumns !== "auto") return;
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setAutoPerRow(Math.max(1, Math.floor(el.clientWidth / AUTO_MIN_CARD)));
    update();
    // happy-dom has no ResizeObserver — the initial measure is enough there.
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isList, libraryColumns]);
  const perRow = libraryColumns === "auto" ? autoPerRow : libraryColumns;

  const listItems: LibraryItem[] = useMemo(
    () => (isList ? flattenLibrary(entries, expandedFamilies) : []),
    [isList, entries, expandedFamilies]
  );
  const gridItems: GridItem[] = useMemo(
    () => (isList ? [] : chunkGrid(entries, expandedFamilies, perRow)),
    [isList, entries, expandedFamilies, perRow]
  );
  const count = isList ? listItems.length : gridItems.length;

  // List rows: the same intrinsic formula the rows use for
  // contain-intrinsic-size (two-line gutter floor vs. proof line height).
  const listRowEstimate = Math.max(53, Math.ceil(proofSize * 1.25) + 16);
  // Grid rows: proof line + card chrome (padding, footer, border) + row gap;
  // a collapsed-group cell stacks its slim header on top. measureElement
  // corrects both, these only keep the scrollbar honest.
  const gridRowEstimate = Math.ceil(proofSize * 1.25) + 122;
  const estimateSize = useCallback(
    (index: number) => {
      if (isList) return listRowEstimate;
      const item = gridItems[index];
      if (item.kind === "header") return 38;
      const hasGroup = item.cells.some((c) => c.kind === "group");
      return gridRowEstimate + (hasGroup ? 34 : 0);
    },
    [isList, listRowEstimate, gridItems, gridRowEstimate]
  );

  // Stable keys (font id / family-derived) keep the virtualizer's measurement
  // cache and React reconciliation aligned across fold flips and re-chunks.
  const getItemKey = useCallback(
    (index: number) => (isList ? listItems[index].font.id : gridItems[index].key),
    [isList, listItems, gridItems]
  );

  const getScrollElement = useCallback(
    () =>
      (containerRef.current?.closest("[data-scroll-container]") as HTMLElement | null) ??
      null,
    []
  );

  // The list starts BELOW the page header/toolbar inside the scroll
  // container; scrollMargin tells the virtualizer about that offset. The
  // container is `relative`, so offsetTop is measured against it. A stale
  // value (e.g. the BulkBar appearing) only shifts the visibility WINDOW —
  // item positions live inside the list's own relative box — and the
  // overscan absorbs it until the next re-measure.
  const [scrollMargin, setScrollMargin] = useState(0);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement,
    estimateSize,
    getItemKey,
    overscan: 8,
    scrollMargin,
  });

  // Cached measurements are per-key but sized by the CURRENT layout: a new
  // proof size, view or column count invalidates them wholesale. Same
  // trigger set re-reads the list's offset in the scroll container.
  useEffect(() => {
    setScrollMargin(containerRef.current?.offsetTop ?? 0);
    virtualizer.measure();
  }, [virtualizer, proofSize, libraryView, perRow]);

  // Fold/unfold REPLACES the chip's host row (collapsed shows the
  // Regular-preferred representative, expanded leads with rows[0] — often
  // different fonts; under virtualization they are different items
  // entirely). The pressed chip/header therefore unmounts and focus would
  // drop to <body>; instead the toggle flags a pending restore and the
  // post-swap effect re-focuses whichever control is mounted for that
  // family now (both carry data-family-toggle).
  const pendingFocus = useRef<string | null>(null);
  const handleToggle = useCallback((family: string) => {
    pendingFocus.current = family;
    useAppStore.getState().toggleFamily(family);
  }, []);
  useEffect(() => {
    const family = pendingFocus.current;
    if (family == null) return;
    pendingFocus.current = null;
    const esc =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(family)
        : family.replace(/["\\]/g, "\\$&");
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-family-toggle="${esc}"]`)
      ?.focus();
  }, [expandedFamilies]);

  const renderListItem = (item: LibraryItem) => (
    <FontListRow
      font={item.font}
      proofText={proofText}
      proofSize={proofSize}
      onOpenDetail={onOpenDetail}
      familyChip={
        item.chip
          ? { ...item.chip, onToggle: () => handleToggle(item.chip!.family) }
          : undefined
      }
    />
  );

  const renderGridItem = (item: GridItem) =>
    item.kind === "header" ? (
      // flex-col so the self-start header shrinks to its content width,
      // exactly like inside the old col-span-full group; pb-2 is the old
      // header→cards gap.
      <div className="flex flex-col pb-2">
        <FamilyGroupHeader group={item.group} expanded onToggle={handleToggle} />
      </div>
    ) : (
      // pb-3 stands in for the old grid's vertical gap-3 (each virtual row
      // is its own grid now); the column template matches the surrounding
      // rows so cells keep lining up across rows.
      <div
        className="grid gap-3 items-start pb-3"
        style={{ gridTemplateColumns: gridTemplateForCount(perRow) }}
      >
        {item.cells.map((cell) =>
          cell.kind === "font" ? (
            <FontCard
              key={cell.font.id}
              font={cell.font}
              proofText={proofText}
              proofSize={proofSize}
              onOpenDetail={onOpenDetail}
            />
          ) : (
            <CollapsedFamilyGroup
              key={cell.group.family}
              group={cell.group}
              proofText={proofText}
              proofSize={proofSize}
              onOpenDetail={onOpenDetail}
              onToggle={handleToggle}
            />
          )
        )}
      </div>
    );

  return (
    <div ref={containerRef} className="mt-4">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vi) => (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full"
            style={{
              transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            {isList ? renderListItem(listItems[vi.index]) : renderGridItem(gridItems[vi.index])}
          </div>
        ))}
      </div>
    </div>
  );
}
