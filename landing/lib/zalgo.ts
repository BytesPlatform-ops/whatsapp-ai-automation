// Zalgo / "cursed" text engine, shared by the Zalgo and Cursed text widgets.
// Decorates each character with random Unicode combining diacritical marks
// (U+0300–U+036F) so text appears to "glitch" or melt. Pure client-side, no deps.

// Marks split by where they render relative to the base glyph.
const UP = Array.from({ length: 0x315 - 0x300 + 1 }, (_, i) => String.fromCharCode(0x300 + i));
const DOWN = Array.from({ length: 0x36f - 0x316 + 1 }, (_, i) => String.fromCharCode(0x316 + i));
const MID = ['̕', '̛', '̀', '́', '̧', '̨', '̃', '̌', '̏', '̮', '̑'];

// A tighter, "cursed" set: enclosing/overlay marks read as eerie rather than
// fully shredded, so a Cursed preset can look creepy while staying readable.
const CURSED_OVERLAY = ['̴', '̶', '̷', '̸', '͜', '͝', '͞', '͟', '͠', '͢'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface ZalgoOptions {
  up?: boolean;
  mid?: boolean;
  down?: boolean;
  /** Adds eerie overlay/strike-through combining marks (Cursed flavour). */
  overlay?: boolean;
}

// `intensity` is the rough max number of marks added per direction per glyph.
export function zalgo(input: string, intensity: number, opts: ZalgoOptions = {}): string {
  const { up = true, mid = true, down = true, overlay = false } = opts;
  return Array.from(input)
    .map((ch) => {
      if (ch === ' ' || ch === '\n' || ch === '\t') return ch;
      let out = ch;
      if (up) {
        const n = Math.floor(Math.random() * intensity);
        for (let i = 0; i < n; i++) out += pick(UP);
      }
      if (mid) {
        const n = Math.floor(Math.random() * Math.max(1, intensity / 3));
        for (let i = 0; i < n; i++) out += pick(MID);
      }
      if (overlay) {
        const n = Math.floor(Math.random() * Math.max(1, intensity / 2));
        for (let i = 0; i < n; i++) out += pick(CURSED_OVERLAY);
      }
      if (down) {
        const n = Math.floor(Math.random() * intensity);
        for (let i = 0; i < n; i++) out += pick(DOWN);
      }
      return out;
    })
    .join('');
}
