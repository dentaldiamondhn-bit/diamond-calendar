/**
 * Procedural-color tinting for calendar events.
 *
 * `ClinicEvent.color` / `RbcEvent.color` holds a hex swatch (procedure or the
 * user-picked palette). The tinted-glass look needs that hex as an rgba fill and
 * a stronger border, so every event surface derives both from the same value
 * instead of hard-coding a second palette.
 */

const FALLBACK_HEX = '#0d9488';

/** `#abc` / `#aabbcc` → `[r, g, b]`; anything else → the clinic teal. */
function parseHex(value: string | null | undefined): [number, number, number] {
  if (typeof value === 'string') {
    const raw = value.trim().replace(/^#/, '');
    const hex = raw.length === 3 ? raw.replace(/(.)/g, '$1$1') : raw;
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }
  const fb = FALLBACK_HEX.slice(1);
  return [
    parseInt(fb.slice(0, 2), 16),
    parseInt(fb.slice(2, 4), 16),
    parseInt(fb.slice(4, 6), 16),
  ];
}

/** Same hue at a new opacity — e.g. `withAlpha('#0d9488', 0.12)` → `rgba(13,148,136,0.12)`. */
export function withAlpha(hex: string | null | undefined, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Inline style handed to RBC's `eventPropGetter`: a tinted fill over the dark
 * calendar grid, a stronger same-hue border and a high-contrast label.
 *
 * The fill is deliberately not near-transparent — at ~12% the procedure hue was
 * unreadable against the dark grid — so the pill keeps most of its color and
 * only the grid lines show through.
 */
export function tintedEventStyle(hex: string | null | undefined): {
  backgroundColor: string;
  borderColor: string;
  color: string;
} {
  return {
    backgroundColor: withAlpha(hex, 0.25),
    borderColor: withAlpha(hex, 0.5),
    color: '#ffffff',
  };
}
