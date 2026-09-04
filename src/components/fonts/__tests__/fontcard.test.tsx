import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FontCard } from "../FontCard";
import { __resetForTest } from "../FontFaceLoader";
import type { FontRow } from "../../../lib/fontFilters";

const favMutate = vi.fn();
const activeMutate = vi.fn();
vi.mock("../../../hooks/useFonts", () => ({
  useToggleFavorite: () => ({ mutate: favMutate, isPending: false }),
}));
vi.mock("../../../hooks/useActivation", () => ({
  useSetActive: () => ({ mutate: activeMutate, isPending: false }),
}));

const font: FontRow = {
  id: 7,
  path: "/lib/Alpha.otf",
  family: "Alpha",
  style: "Regular",
  ps_name: null,
  source: "Foundry",
  format: "otf",
  glyph_count: 200,
  is_system: 0,
  active: 0,
  favorite: 0,
  quarantined: 0,
  licence_status: "free",
  tag_ids: "",
};

const openDetail = vi.fn();

function renderCard() {
  return render(
    <FontCard font={font} proofText="Proof" proofSize={20} onOpenDetail={openDetail} />
  );
}

/** The card root — an actionable role="button" named via open_details. */
function getCard() {
  return screen.getByRole("button", { name: /open details/i });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetForTest();
});

describe("FontCard keyboard access (I1)", () => {
  it("is focusable and opens the detail on Enter", () => {
    renderCard();
    const card = getCard();
    expect(card).toHaveAttribute("tabindex", "0");
    card.focus();
    fireEvent.keyDown(card, { key: "Enter" });
    expect(openDetail).toHaveBeenCalledTimes(1);
    expect(openDetail).toHaveBeenCalledWith(7);
  });

  it("opens the detail on Space and prevents the default (page scroll)", () => {
    renderCard();
    const card = getCard();
    card.focus();
    // fireEvent returns false when preventDefault() was called
    const notPrevented = fireEvent.keyDown(card, { key: " " });
    expect(notPrevented).toBe(false);
    expect(openDetail).toHaveBeenCalledWith(7);
  });

  it("ignores Enter forwarded from an inner control (the star)", () => {
    renderCard();
    const star = screen.getByRole("button", { name: "Add to favorites" });
    star.focus();
    fireEvent.keyDown(star, { key: "Enter" });
    expect(openDetail).not.toHaveBeenCalled();
  });

  it("opens on a plain card click but NOT when clicking the star", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Add to favorites" }));
    expect(favMutate).toHaveBeenCalledWith({ id: 7, favorite: 1 });
    expect(openDetail).not.toHaveBeenCalled();
    fireEvent.click(getCard());
    expect(openDetail).toHaveBeenCalledTimes(1);
    expect(openDetail).toHaveBeenCalledWith(7);
  });

  it("does not open when clicking the selection checkbox", () => {
    renderCard();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select font" }));
    expect(openDetail).not.toHaveBeenCalled();
  });
});
