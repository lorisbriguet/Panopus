import { useEffect } from "react";
import { useT } from "../../i18n/useT";
import { ensureFontFace } from "./FontFaceLoader";

/** Inclusive code-point range helper. */
function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let cp = from; cp <= to; cp++) out.push(cp);
  return out;
}

/** U+0020-007E — exactly 95 printable Basic Latin code points. */
const BASIC_LATIN = range(0x20, 0x7e);
/** U+00A0-00FF — the 96 Latin-1 Supplement printables. */
const LATIN_1 = range(0xa0, 0xff);
/**
 * Curated punctuation/symbol picks from U+2013-2122: dashes, curly quotes,
 * daggers, bullet, ellipsis, per-mille, primes, guillemets, euro, trademark.
 */
const PUNCTUATION: number[] = [
  0x2013, // – en dash
  0x2014, // — em dash
  0x2018, // ' left single quote
  0x2019, // ' right single quote
  0x201a, // ‚ single low quote
  0x201c, // " left double quote
  0x201d, // " right double quote
  0x201e, // „ double low quote
  0x2020, // † dagger
  0x2021, // ‡ double dagger
  0x2022, // • bullet
  0x2026, // … ellipsis
  0x2030, // ‰ per mille
  0x2032, // ′ prime
  0x2033, // ″ double prime
  0x2039, // ‹ single left guillemet
  0x203a, // › single right guillemet
  0x20ac, // € euro
  0x2122, // ™ trademark
];

interface GlyphMapProps {
  /** fonts.id — determines the pf<id> family name. */
  id: number;
  /** fonts.path — loaded through ensureFontFace on mount. */
  path: string;
}

function GlyphSection({
  title,
  testId,
  codePoints,
  family,
}: {
  title: string;
  testId: string;
  codePoints: number[];
  family: string;
}) {
  return (
    <section data-testid={testId}>
      <h4 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
        {title}
      </h4>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1">
        {codePoints.map((cp) => (
          <span
            key={cp}
            data-testid="glyph-cell"
            title={`U+${cp.toString(16).toUpperCase().padStart(4, "0")}`}
            style={{ fontFamily: family }}
            className="flex items-center justify-center h-10 text-lg rounded-md bg-[var(--color-input-bg)] border border-[var(--color-border-divider)] select-none"
          >
            {String.fromCodePoint(cp)}
          </span>
        ))}
      </div>
    </section>
  );
}

/**
 * Character-map tab of the font detail panel: Basic Latin (95 cells),
 * Latin-1 Supplement (96 cells) and a curated punctuation/symbol set, every
 * cell rendered in the font's own pf<id> face. Only mounted when the Glyphs
 * tab is first selected, so the face load is strictly opt-in.
 */
export function GlyphMap({ id, path }: GlyphMapProps) {
  const t = useT();
  // pf<id> is deterministic — render with it immediately; the effect
  // registers the @font-face (idempotent) so the glyphs resolve.
  const family = `pf${id}`;

  useEffect(() => {
    ensureFontFace(id, path);
  }, [id, path]);

  return (
    <div className="flex flex-col gap-5">
      <GlyphSection
        title={t.glyphs_basic_latin}
        testId="glyph-section-basic-latin"
        codePoints={BASIC_LATIN}
        family={family}
      />
      <GlyphSection
        title={t.glyphs_latin_1}
        testId="glyph-section-latin-1"
        codePoints={LATIN_1}
        family={family}
      />
      <GlyphSection
        title={t.glyphs_punctuation}
        testId="glyph-section-punctuation"
        codePoints={PUNCTUATION}
        family={family}
      />
    </div>
  );
}
