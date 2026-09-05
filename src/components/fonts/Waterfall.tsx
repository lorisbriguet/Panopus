import { useEffect } from "react";
import { useAppStore, DEFAULT_PROOF_TEXT } from "../../stores/app-store";
import { ensureFontFace } from "./FontFaceLoader";

/** Classic waterfall ladder, largest first. */
const WATERFALL_SIZES = [72, 48, 36, 24, 18, 14, 12, 10];

interface WaterfallProps {
  /** fonts.id — determines the pf<id> family name. */
  id: number;
  /** fonts.path — loaded through ensureFontFace on mount. */
  path: string;
  /**
   * fonts.sample_text — specimen for fonts mapping no Latin letters. When
   * set, it replaces the proof text (which would render blank in the font).
   */
  sampleText?: string | null;
}

/**
 * Waterfall tab of the font detail panel: the library's proof text (app
 * store slice, shared with the grid's ProofToolbar) repeated at a fixed
 * ladder of sizes in the font's own pf<id> face. Only mounted when the
 * Waterfall tab is first selected — strictly opt-in.
 */
export function Waterfall({ id, path, sampleText }: WaterfallProps) {
  const proofText = useAppStore((s) => s.proofText);
  const family = `pf${id}`;

  useEffect(() => {
    ensureFontFace(id, path);
  }, [id, path]);

  const text =
    sampleText ?? (proofText.trim() === "" ? DEFAULT_PROOF_TEXT : proofText);

  return (
    <div className="flex flex-col gap-3">
      {WATERFALL_SIZES.map((size) => (
        <div key={size} className="flex items-baseline gap-3">
          <span className="w-8 shrink-0 text-right text-xs text-muted tabular-nums">
            {size}
          </span>
          <div
            className="min-w-0 overflow-hidden break-words leading-tight"
            style={{ fontFamily: family, fontSize: size }}
          >
            {text}
          </div>
        </div>
      ))}
    </div>
  );
}
