import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  hexToRgb,
  hsvToRgb,
  normalizeHex,
  rgbToHex,
  rgbToHsv,
} from "../../lib/colorSpace";

/**
 * Photoshop-style color picker (node review): saturation/value field for
 * the current hue, hue strip, hex + RGB fields — replacing the native
 * OS swatch on every color param. Emits live while dragging. State is
 * HSV internally so the hue stays put at s=0 / v=0 extremes.
 */

export type ColorPickerHandle = { open: () => void };

type Props = {
  value: string;
  onChange: (hex: string) => void;
  ariaLabel?: string;
};

const HUE_STRIP =
  "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";

export const ColorPicker = forwardRef<ColorPickerHandle, Props>(
  function ColorPicker({ value, onChange, ariaLabel }, ref) {
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState({ left: 0, top: 0 });
    const [hsv, setHsv] = useState<[number, number, number]>([0, 0, 1]);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const svRef = useRef<HTMLDivElement>(null);
    const hueRef = useRef<HTMLDivElement>(null);
    const dragging = useRef<"sv" | "hue" | null>(null);
    const [hexDraft, setHexDraft] = useState<string | null>(null);

    const hex = normalizeHex(value) ?? "#000000";
    const rgb = hexToRgb(hex) ?? [0, 0, 0];

    const openAt = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      const width = 216;
      const height = 214;
      const left = Math.min(Math.max(8, r?.left ?? 0), window.innerWidth - width - 8);
      const below = (r?.bottom ?? 0) + 6;
      const top =
        below + height > window.innerHeight ? Math.max(8, (r?.top ?? 0) - height - 6) : below;
      setAnchor({ left, top });
      setHsv(rgbToHsv(...(hexToRgb(normalizeHex(value) ?? "#000000") ?? [0, 0, 0])));
      setHexDraft(null);
      setOpen(true);
    };
    useImperativeHandle(ref, () => ({ open: openAt }));

    useEffect(() => {
      if (!open) return;
      const away = (e: PointerEvent) => {
        if (
          popRef.current?.contains(e.target as Node) ||
          triggerRef.current?.contains(e.target as Node)
        )
          return;
        setOpen(false);
      };
      const key = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      document.addEventListener("pointerdown", away);
      document.addEventListener("keydown", key);
      return () => {
        document.removeEventListener("pointerdown", away);
        document.removeEventListener("keydown", key);
      };
    }, [open]);

    const commitHsv = (next: [number, number, number]) => {
      setHsv(next);
      setHexDraft(null);
      onChange(rgbToHex(...hsvToRgb(...next)));
    };
    const pickSv = (clientX: number, clientY: number) => {
      const r = svRef.current?.getBoundingClientRect();
      if (!r) return;
      const s = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)));
      const v = 1 - Math.min(1, Math.max(0, (clientY - r.top) / Math.max(1, r.height)));
      commitHsv([hsv[0], s, v]);
    };
    const pickHue = (clientX: number) => {
      const r = hueRef.current?.getBoundingClientRect();
      if (!r) return;
      const h = 360 * Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)));
      commitHsv([h, hsv[1], hsv[2]]);
    };
    const capture = (el: Element | null, pointerId: number) => {
      try {
        (el as HTMLElement | null)?.setPointerCapture(pointerId);
      } catch {
        // test DOMs without pointer capture
      }
    };
    const setChannel = (i: 0 | 1 | 2, raw: string) => {
      const n = Math.min(255, Math.max(0, Math.round(Number(raw))));
      if (!Number.isFinite(n)) return;
      const next: [number, number, number] = [...rgb] as [number, number, number];
      next[i] = n;
      setHsv(rgbToHsv(...next));
      setHexDraft(null);
      onChange(rgbToHex(...next));
    };
    const commitHexDraft = () => {
      if (hexDraft === null) return;
      const n = normalizeHex(hexDraft);
      setHexDraft(null);
      if (!n) return;
      setHsv(rgbToHsv(...(hexToRgb(n) ?? [0, 0, 0])));
      onChange(n);
    };

    const [h, s, v] = hsv;
    const live = open ? rgbToHex(...hsvToRgb(h, s, v)) : hex;

    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel ?? "pick color"}
          onClick={() => (open ? setOpen(false) : openAt())}
          className="flex-1 h-7 rounded-[3px] border border-white/15 bg-[var(--color-input-bg)] flex items-center gap-2 px-1.5 font-mono"
        >
          <span
            className="w-4 h-4 rounded-[2px] border border-black/40"
            style={{ background: hex }}
          />
          <span className="text-[10px] text-white/80">{hex}</span>
        </button>
        {open && (
          <div
            ref={popRef}
            role="dialog"
            aria-label="color picker"
            className="fixed z-50 w-[216px] rounded-[3px] border border-white/10 bg-[#1e1e23]/[0.98] p-2 font-mono shadow-[0_16px_40px_rgba(0,0,0,0.6)] flex flex-col gap-2"
            style={{ left: anchor.left, top: anchor.top }}
          >
            <div
              ref={svRef}
              data-testid="sv-field"
              className="relative h-28 rounded-[2px] cursor-crosshair touch-none"
              style={{
                background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${h} 100% 50%))`,
              }}
              onPointerDown={(e) => {
                dragging.current = "sv";
                capture(e.currentTarget, e.pointerId);
                pickSv(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                if (dragging.current === "sv") pickSv(e.clientX, e.clientY);
              }}
              onPointerUp={() => {
                dragging.current = null;
              }}
            >
              <span
                className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.8)] pointer-events-none"
                style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: live }}
              />
            </div>
            <div
              ref={hueRef}
              data-testid="hue-strip"
              className="relative h-3 rounded-[2px] cursor-crosshair touch-none"
              style={{ background: HUE_STRIP }}
              onPointerDown={(e) => {
                dragging.current = "hue";
                capture(e.currentTarget, e.pointerId);
                pickHue(e.clientX);
              }}
              onPointerMove={(e) => {
                if (dragging.current === "hue") pickHue(e.clientX);
              }}
              onPointerUp={() => {
                dragging.current = null;
              }}
            >
              <span
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-4 rounded-[2px] border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.8)] pointer-events-none"
                style={{ left: `${(h / 360) * 100}%`, background: `hsl(${h} 100% 50%)` }}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-6 h-6 rounded-[2px] border border-black/40 shrink-0"
                style={{ background: live }}
              />
              <input
                aria-label="hex"
                value={hexDraft ?? live}
                onChange={(e) => setHexDraft(e.target.value)}
                onBlur={commitHexDraft}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitHexDraft();
                }}
                className="w-[68px] h-6 px-1 rounded-[2px] border border-white/15 bg-[var(--color-input-bg)] text-[10px] text-white/90"
              />
              {(["r", "g", "b"] as const).map((c, i) => (
                <input
                  key={c}
                  aria-label={c}
                  type="number"
                  min={0}
                  max={255}
                  value={rgb[i]}
                  onChange={(e) => setChannel(i as 0 | 1 | 2, e.target.value)}
                  className="w-10 h-6 px-1 rounded-[2px] border border-white/15 bg-[var(--color-input-bg)] text-[10px] text-white/90 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              ))}
            </div>
          </div>
        )}
      </>
    );
  }
);
