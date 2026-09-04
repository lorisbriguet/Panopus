/**
 * Panopus brand wordmark: renders "panopus" with each letter set in a random
 * font from the indexed library, re-rolled on every app load. Falls back to
 * the inherited UI font until the library has fonts (first boot, tests).
 */
import { useEffect, useState } from "react";
import { useFonts } from "../hooks/useFonts";
import type { FontRow } from "../lib/fontFilters";
import { ensureFontFace } from "./fonts/FontFaceLoader";

/** One random library pick per letter, chosen once per mount (= per reload). */
function useLetterFonts(count: number): (FontRow | null)[] {
  const { data: rows } = useFonts();
  const [picks, setPicks] = useState<FontRow[] | null>(null);

  useEffect(() => {
    if (picks !== null) return;
    const library = (rows ?? []).filter((r) => r.is_system === 0);
    if (library.length === 0) return;
    setPicks(
      Array.from({ length: count }, () => library[Math.floor(Math.random() * library.length)]),
    );
  }, [rows, picks, count]);

  return picks ?? Array.from({ length: count }, () => null);
}

function LetterWord({
  word,
  testId,
  className,
}: {
  word: string;
  testId: string;
  className?: string;
}) {
  const picks = useLetterFonts(word.length);
  return (
    <span
      role="img"
      aria-label="Panopus"
      data-testid={testId}
      className={`select-none leading-none whitespace-nowrap ${className ?? ""}`}
    >
      {word.split("").map((ch, i) => {
        const row = picks[i];
        return (
          <span
            key={i}
            aria-hidden="true"
            style={row ? { fontFamily: ensureFontFace(row.id, row.path) } : undefined}
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
}

/** Full "panopus" wordmark (expanded sidebar). */
export function BrandLogo({ className = "" }: { className?: string }) {
  return <LetterWord word="panopus" testId="brand-wordmark" className={className} />;
}

/** Single-letter mark (collapsed sidebar, small placements). */
export function BrandMark({ className = "" }: { className?: string }) {
  return <LetterWord word="p" testId="brand-mark" className={className} />;
}
