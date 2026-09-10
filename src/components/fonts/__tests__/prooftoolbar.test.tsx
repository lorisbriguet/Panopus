import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProofToolbar } from "../ProofToolbar";
import { useAppStore, DEFAULT_PROOF_TEXT } from "../../../stores/app-store";

// TagManager drags in the tag hooks (DB access) — the toolbar only mounts
// it behind its pencil button, irrelevant here.
vi.mock("../TagManager", () => ({ TagManager: () => null }));

function renderToolbar() {
  return render(<ProofToolbar sources={[]} licences={[]} tags={[]} />);
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ proofText: DEFAULT_PROOF_TEXT, customPangram: DEFAULT_PROOF_TEXT });
});

describe("ProofToolbar pangram preset", () => {
  it("applies the user-defined pangram from settings", () => {
    useAppStore.setState({ customPangram: "Portez ce vieux whisky" });
    renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Pangram" }));
    expect(useAppStore.getState().proofText).toBe("Portez ce vieux whisky");
  });

  it("falls back to the classic pangram when never customized", () => {
    useAppStore.setState({ proofText: "something else" });
    renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Pangram" }));
    expect(useAppStore.getState().proofText).toBe(DEFAULT_PROOF_TEXT);
  });
});
