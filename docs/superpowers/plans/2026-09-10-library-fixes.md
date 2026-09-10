# Library Fixes Round One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four open library-side tickets — system fonts shown as active (#376), instant + diagnosable activation feedback (#409), user-defined pangram in Settings (#378), visible tag removal on the font detail (#377).

**Architecture:** All four are thin changes over existing seams: a derived-active helper in `fontFilters`, an optimistic-cache layer in `useSetActive`, one new zustand field + Settings section, and a ✕ affordance on the existing TagEditor pills. No schema changes, no new Rust commands; the only Rust edit is un-gating the log plugin.

**Tech Stack:** React 18 + TanStack Query v5 + zustand (localStorage persistence), vitest + React Testing Library, Tauri v2 (Rust edit limited to `lib.rs` plugin setup).

**Spec:** StudioManager tickets (task 926: #376 #378 #409; task 927: #377), root causes established in `.superpowers/sdd/2026-09-10-library-fixes/progress.md` preamble (Phase-1 evidence: all 955 `is_system=1` rows have `active=0`; app log shows the `["fonts"]` refetch takes 4.4–13.8s in the field while the activation toggle has no optimistic state; zero CoreText errors logged across three days).

## Global Constraints

- Gates per commit: `npx tsc --noEmit` (from repo root), `npm test`, `npm run lint`, `cargo test` (in `src-tauri`) — parity untouched (no shader changes in this plan).
- Every new i18n key lands in BOTH `ui.en` and `ui.fr` (`src/i18n/ui.ts`) — enforced by `src/__tests__/i18nParity.test.ts`.
- Tick each StudioManager subtask `done` (status + `updated_at`) as its task lands — DB at `~/Library/Application Support/ch.studiomanager.app/studiomanager.db`, table `subtasks` (#376/#378/#409 → task 926, #377 → task 927).
- System fonts remain non-toggleable — #376 changes the *display* semantics only, matching the spec's "read-only awareness" rule and the existing `system_font_locked` tooltip ("System fonts stay active").
- `fonts.active` DB semantics unchanged: it means "registered by Panopus", never set for `is_system=1` (reactivate_all's `AND is_system = 0` filter stays load-bearing).

---

### Task 1: #376 — system fonts render as active

**Files:**
- Modify: `src/lib/fontFilters.ts` (add helper; use in `filterFonts`)
- Modify: `src/components/fonts/FontListRow.tsx:243`, `src/components/fonts/FontCard.tsx:212`, `src/components/fonts/FontDetail.tsx:400`, `src/components/fonts/SortableRow.tsx:96` (toggle `checked`)
- Modify: `src/pages/LibraryPage.tsx:55-58` (active count)
- Test: `src/hooks/__tests__/fontFilters.test.ts`, `src/components/fonts/__tests__/fontlistrow.test.tsx`

**Interfaces:**
- Produces: `isFontActive(row: Pick<FontRow, "active" | "is_system">): boolean` exported from `src/lib/fontFilters.ts` — Task 2's optimistic patch must NOT touch `is_system` rows, and later UI work should always read active-ness through this helper.

- [ ] **Step 1: Write the failing tests**

In `src/hooks/__tests__/fontFilters.test.ts` (existing file, extend):

```ts
import { isFontActive } from "../../lib/fontFilters";

describe("isFontActive", () => {
  it("derives active from the DB flag for library fonts", () => {
    expect(isFontActive({ active: 1, is_system: 0 })).toBe(true);
    expect(isFontActive({ active: 0, is_system: 0 })).toBe(false);
  });
  it("treats system fonts as always active (macOS registered them)", () => {
    expect(isFontActive({ active: 0, is_system: 1 })).toBe(true);
  });
  it("onlyActive filter includes system fonts", () => {
    const rows = [row({ id: 1, active: 0, is_system: 1 }), row({ id: 2, active: 0 })];
    expect(filterFonts(rows, { ...EMPTY, onlyActive: true }).map((r) => r.id)).toEqual([1]);
  });
});
```

(`row(...)`/`EMPTY` — reuse the existing fixtures/builders already present in that test file; match their names on sight.)

In `src/components/fonts/__tests__/fontlistrow.test.tsx`, replace the pinned test at lines 112-116:

```tsx
it("system fonts: checkbox and toggle disabled, but toggle reads ON", () => {
  renderRow({ is_system: 1 });
  expect(screen.getByRole("checkbox", { name: "Select font" })).toBeDisabled();
  const sw = screen.getByRole("switch", { name: "Font active" });
  expect(sw).toBeDisabled();
  expect(sw).toHaveAttribute("aria-checked", "true");
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- fontFilters fontlistrow` → new cases FAIL (`isFontActive` not exported; aria-checked "false").

- [ ] **Step 3: Implement**

`src/lib/fontFilters.ts` — add below the `FontRow` type:

```ts
/**
 * A font is "active" when it is usable in other apps right now: either
 * Panopus registered it (fonts.active) or macOS did (is_system — the OS
 * registers system/user-installed fonts itself; our DB flag stays 0 for
 * those by construction, see activation.rs reactivate_all).
 */
export function isFontActive(row: Pick<FontRow, "active" | "is_system">): boolean {
  return row.active === 1 || row.is_system === 1;
}
```

In `filterFonts` line 53: `if (q.onlyActive && !isFontActive(r)) return false;`

The four toggles: replace `checked={font.active === 1}` with `checked={isFontActive(font)}` (import from `../../lib/fontFilters`). `SortableRow` uses its own row variable name — same substitution.

`LibraryPage.tsx:55-58`: replace `.filter((r) => r.active === 1)` with `.filter(isFontActive)`.

- [ ] **Step 4: Run gates** — `npm test`, `npx tsc --noEmit`, `npm run lint` all green.

- [ ] **Step 5: Commit + tick**

```bash
git add -A && git commit -m "fix: system fonts render as active (macOS registers them)"
sqlite3 "$SM_DB" "UPDATE subtasks SET status='done', updated_at=datetime('now') WHERE id=376;"
```

### Task 2: #409 — activation feedback is instant and release-diagnosable

**Files:**
- Modify: `src/hooks/useActivation.ts` (optimistic cache patch + rollback)
- Modify: `src-tauri/src/lib.rs:611-617` (register log plugin unconditionally)
- Test: `src/hooks/__tests__/useActivation.test.tsx`

**Interfaces:**
- Consumes: `isFontActive` semantics from Task 1 — the optimistic patch only flips `active` on non-system rows (system rows are untoggleable anyway).
- Produces: unchanged `useSetActive()` signature; cache key `["fonts"]` now patched synchronously on mutate.

- [ ] **Step 1: Write the failing tests** — extend `src/hooks/__tests__/useActivation.test.tsx` (reuse its existing QueryClient/wrapper setup; seed `["fonts"]` data):

```tsx
it("optimistically flips active in the fonts cache before the command resolves", async () => {
  qc.setQueryData(["fonts"], [fontRow({ id: 1, active: 0 }), fontRow({ id: 2, active: 0 })]);
  let resolve!: (v: FontActivationResult[]) => void;
  mockInvoke.mockReturnValue(new Promise((r) => (resolve = r)));
  const { result } = renderHook(() => useSetActive(), { wrapper });
  act(() => result.current.mutate({ ids: [1], active: true }));
  await waitFor(() =>
    expect(qc.getQueryData<FontRow[]>(["fonts"])![0].active).toBe(1)
  );
  expect(qc.getQueryData<FontRow[]>(["fonts"])![1].active).toBe(0);
  act(() => resolve([{ id: 1, ok: true, error: null }]));
});

it("rolls the cache back when the command rejects", async () => {
  qc.setQueryData(["fonts"], [fontRow({ id: 1, active: 0 })]);
  mockInvoke.mockRejectedValue(new Error("boom"));
  const { result } = renderHook(() => useSetActive(), { wrapper });
  act(() => result.current.mutate({ ids: [1], active: true }));
  await waitFor(() =>
    expect(qc.getQueryData<FontRow[]>(["fonts"])![0].active).toBe(0)
  );
});

it("reverts only the failed ids on partial failure", async () => {
  qc.setQueryData(["fonts"], [fontRow({ id: 1, active: 0 }), fontRow({ id: 2, active: 0 })]);
  mockInvoke.mockResolvedValue([
    { id: 1, ok: true, error: null },
    { id: 2, ok: false, error: "CoreText error 301" },
  ]);
  const { result } = renderHook(() => useSetActive(), { wrapper });
  act(() => result.current.mutate({ ids: [1, 2], active: true }));
  await waitFor(() => {
    const rows = qc.getQueryData<FontRow[]>(["fonts"])!;
    expect(rows[0].active).toBe(1);
    expect(rows[1].active).toBe(0);
  });
});
```

Note: the settled-invalidate will refetch `["fonts"]` — the existing tests mock the query fn / leave no `queryFn`; keep the cache non-refetchable the same way they do (their QueryClient config already disables retries; seed with `setQueryData` only, no observer → no refetch).

- [ ] **Step 2: Run to verify failure** — `npm test -- useActivation` → new cases FAIL (cache never patched).

- [ ] **Step 3: Implement** — in `useSetActive()`:

```ts
const patchFonts = (ids: number[], active: 0 | 1) =>
  qc.setQueryData<FontRow[]>(["fonts"], (rows) =>
    rows?.map((r) =>
      ids.includes(r.id) && r.is_system !== 1 ? { ...r, active } : r
    )
  );

return useMutation({
  mutationFn: ({ ids, active }: { ids: number[]; active: boolean }) =>
    invoke<FontActivationResult[]>("set_fonts_active", { ids, active }),
  // Optimistic: the fonts master query measures 4-14s in the field
  // (see 2026-09-10 ledger) — without this the toggle looks dead.
  onMutate: async ({ ids, active }) => {
    await qc.cancelQueries({ queryKey: ["fonts"] });
    const previous = qc.getQueryData<FontRow[]>(["fonts"]);
    patchFonts(ids, active ? 1 : 0);
    return { previous };
  },
  onError: (_e, _vars, ctx) => {
    if (ctx?.previous) qc.setQueryData(["fonts"], ctx.previous);
  },
  onSuccess: (results, { active }) => {
    const failed = results.filter((r) => !r.ok);
    if (failed.length === 0) return;
    // Snap failed ids back immediately — the settle refetch is slow.
    patchFonts(failed.map((f) => f.id), active ? 0 : 1);
    /* existing toast + logError block unchanged */
  },
  onSettled: () => qc.invalidateQueries({ queryKey: ["fonts"] }),
});
```

Import `type { FontRow }` from `../lib/fontFilters`. Keep the whole existing toast/logError body inside `onSuccess`.

`src-tauri/src/lib.rs:611-617` — drop the `cfg!(debug_assertions)` gate so release builds keep file logs (the P4-era investigation found per-font CoreText errors are invisible in release):

```rust
app.handle().plugin(
    tauri_plugin_log::Builder::default()
        .level(log::LevelFilter::Info)
        .build(),
)?;
```

- [ ] **Step 4: Run gates** — `npm test`, `npx tsc --noEmit`, `npm run lint`, `cargo test` in `src-tauri` (build gate for the lib.rs edit).

- [ ] **Step 5: Commit + tick + file perf ticket**

```bash
git add -A && git commit -m "fix: optimistic activation toggle + release-build logging"
sqlite3 "$SM_DB" "UPDATE subtasks SET status='done', updated_at=datetime('now') WHERE id=409;
INSERT INTO subtasks (task_id, title, sort_order) VALUES (927, 'library fonts query is slow (4-14s measured in Panopus.log) — split tag aggregation out of the master SELECT', (SELECT COALESCE(MAX(sort_order),-1)+1 FROM subtasks WHERE task_id=927));"
```

### Task 3: #378 — user-defined pangram, editable in Settings

**Files:**
- Modify: `src/stores/app-store.ts` (field `customPangram` + setter; interface + initializer)
- Modify: `src/components/fonts/ProofToolbar.tsx:76-78` (pangram preset applies the custom value)
- Modify: `src/pages/SettingsPage.tsx` (new "proofing" nav category + panel)
- Modify: `src/i18n/ui.ts` (new keys, EN + FR)
- Modify: `src/components/fonts/FontListRow.tsx:194`, `src/components/fonts/FontCard.tsx:146` (blank-proof fallback, consistency with SortableRow/Waterfall)
- Test: `src/components/fonts/__tests__/prooftoolbar.test.tsx` (extend or create alongside the existing fonts tests), `src/components/fonts/__tests__/fontlistrow.test.tsx`

**Interfaces:**
- Produces: `useAppStore` gains `customPangram: string` and `setCustomPangram(text: string): void` (write-through to `localStorage["customPangram"]`, default `DEFAULT_PROOF_TEXT`).

- [ ] **Step 1: Write the failing tests**

```tsx
// prooftoolbar test — mock pattern as in the sibling fonts tests
it("pangram preset applies the user-defined pangram", () => {
  useAppStore.setState({ customPangram: "Portez ce vieux whisky" });
  renderToolbar();
  fireEvent.click(screen.getByRole("button", { name: "Pangram" }));
  expect(useAppStore.getState().proofText).toBe("Portez ce vieux whisky");
});
```

```tsx
// fontlistrow test — blank proof falls back to the default line
it("renders the default proof line when proof text is blank", () => {
  renderRow({}, { proofText: "" });   // adapt to the harness's prop plumbing
  expect(screen.getByText(DEFAULT_PROOF_TEXT)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

`app-store.ts`: interface + `customPangram: localStorage.getItem("customPangram") ?? DEFAULT_PROOF_TEXT,` in the initializer next to `proofText` (line 372), setter next to `setProofText`:

```ts
setCustomPangram: (text) => {
  localStorage.setItem("customPangram", text);
  set({ customPangram: text });
},
```

`ProofToolbar.tsx`: `const customPangram = useAppStore((s) => s.customPangram);` and the preset button becomes `onClick={() => setProofText(customPangram)}`.

`SettingsPage.tsx`: extend `type SettingsCategory = "library" | "appearance" | "proofing" | "updates";`, add a nav button (icon `Type` from lucide-react) between appearance and updates, and:

```tsx
const customPangram = useAppStore((s) => s.customPangram);
const setCustomPangram = useAppStore((s) => s.setCustomPangram);

const renderProofing = () => (
  <div className="space-y-6">
    <div>
      <label className="block mb-1.5 text-sm font-medium text-fg-base">
        {t.custom_pangram_label}
      </label>
      <p className="text-xs text-muted mb-2">{t.custom_pangram_hint}</p>
      <div className="flex items-center gap-3">
        <Input
          value={customPangram}
          onChange={(e) => setCustomPangram(e.target.value)}
          aria-label={t.custom_pangram_label}
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={customPangram === DEFAULT_PROOF_TEXT}
          onClick={() => setCustomPangram(DEFAULT_PROOF_TEXT)}
        >
          {t.custom_pangram_reset}
        </Button>
      </div>
    </div>
  </div>
);
```

(import `Input` from `../components/ui`, `DEFAULT_PROOF_TEXT` from the store; panel wired as `{activeCategory === "proofing" && renderProofing()}`).

i18n (EN / FR):
- `proofing_category`: "Proofing" / "Épreuves"
- `custom_pangram_label`: "Custom pangram" / "Pangramme personnalisé"
- `custom_pangram_hint`: "Used by the Pangram preset above the library grid." / "Utilisé par le préréglage Pangramme au-dessus de la grille."
- `custom_pangram_reset`: "Reset to default" / "Rétablir la valeur par défaut"

Blank-proof fallback: in `FontListRow.tsx:194` and `FontCard.tsx:146` replace `{font.sample_text ?? proofText}` with `{font.sample_text ?? (proofText || DEFAULT_PROOF_TEXT)}` (import the constant) — same rule SortableRow/Waterfall already apply.

- [ ] **Step 4: Run gates** (i18nParity covers the new keys).

- [ ] **Step 5: Commit + tick**

```bash
git add -A && git commit -m "feat: user-defined pangram in Settings"
sqlite3 "$SM_DB" "UPDATE subtasks SET status='done', updated_at=datetime('now') WHERE id=378;"
```

### Task 4: #377 — visible tag removal on the font detail

**Files:**
- Modify: `src/components/fonts/FontDetail.tsx:71-154` (TagEditor: ✕ on assigned pills; export for testing)
- Modify: `src/i18n/ui.ts` (hover-hint keys, EN + FR)
- Test: `src/components/fonts/__tests__/tageditor.test.tsx` (new — covers the until-now untested single-font unassign path)

**Interfaces:**
- Consumes: `useUnassignTag()` from `src/hooks/useTags.ts:86-98` — payload `{ fontId, tagId }`.
- Produces: named export `TagEditor` from `FontDetail.tsx` (component itself unchanged in signature: `{ font: FontRow }`).

- [ ] **Step 1: Write the failing test** — `tageditor.test.tsx`, mock `useTags`/`useAssignTag`/`useUnassignTag`/`useCreateTag` the way `bulktag.test.tsx` mocks its hooks:

```tsx
it("assigned pills show the remove affordance and unassign on click", () => {
  render(<TagEditor font={fontRow({ id: 7, tag_ids: "3" })} />);
  const pill = screen.getByRole("button", { name: /Display/ }); // tag 3 = "Display" in the mock
  expect(pill).toHaveAttribute("aria-pressed", "true");
  expect(pill).toHaveAttribute("title", "Remove tag");
  fireEvent.click(pill);
  expect(unassignMutate).toHaveBeenCalledWith({ fontId: 7, tagId: 3 });
});

it("unassigned pills assign on click", () => {
  render(<TagEditor font={fontRow({ id: 7, tag_ids: "" })} />);
  fireEvent.click(screen.getByRole("button", { name: /Display/ }));
  expect(assignMutate).toHaveBeenCalledWith({ fontId: 7, tagId: 3 });
});
```

- [ ] **Step 2: Run to verify failure** (no `TagEditor` export, no title attr).

- [ ] **Step 3: Implement** — in `FontDetail.tsx`: change `function TagEditor` to `export function TagEditor`; inside the pill button add the affordance and hint:

```tsx
import { X } from "lucide-react";  // extend the existing lucide import line

<button
  /* ...existing props... */
  title={on ? t.tag_remove_hint : t.tag_assign_hint}
  className="text-xs px-2.5 py-0.5 rounded-full font-medium status-transition focus-accent border inline-flex items-center gap-1"
>
  {tag.name}
  {on && <X size={11} aria-hidden="true" />}
</button>
```

i18n: `tag_remove_hint`: "Remove tag" / "Retirer l'étiquette"; `tag_assign_hint`: "Add tag" / "Ajouter l'étiquette".

- [ ] **Step 4: Run gates.**

- [ ] **Step 5: Commit + tick + close the parent tasks**

```bash
git add -A && git commit -m "feat: visible tag removal on font detail"
sqlite3 "$SM_DB" "UPDATE subtasks SET status='done', updated_at=datetime('now') WHERE id=377;
UPDATE tasks SET status='done', updated_at=datetime('now') WHERE id=926;"
```

(Task 927 stays `todo` — it gains the new perf subtask in Task 2.)

---

## Self-review notes

- #376 keeps `fonts.active` untouched for system rows on purpose: `reactivate_all` must never re-register OS fonts, and the "Panopus registered it" DB meaning stays crisp. Display-only derivation. Edge accepted: a font the user disabled in Font Book still reads active — strictly better than today's all-inactive, noted for the ledger.
- #409's optimistic patch must skip `is_system=1` rows so a stale bulk payload can never flip a system row's cache state; the settled invalidate remains the truth-restorer in every path.
- The useActivation tests must keep the "no observer → no refetch" property; if the settled invalidate starts refetching in-test, assert before settle (`waitFor` on the patch, resolve later) exactly as written.
- SettingsPage gets no new test file (its tauri surface is heavy to mock); the store setter and toolbar preset are covered, i18nParity guards the labels, manual pass covers the panel.
