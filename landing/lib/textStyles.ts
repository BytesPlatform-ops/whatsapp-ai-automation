// Shared Unicode text-style transforms used by the text-generator tools
// (fancy-text, bold-text, tiny-text, upside-down, strikethrough).
//
// Most "font" styles are just Unicode Mathematical Alphanumeric Symbols mapped
// 1:1 from ASCII. Many blocks are contiguous (a..z, A..Z, 0..9 run in order) so
// we generate them from a base code point; the few blocks with reserved holes
// (script, fraktur, double-struck, italic-h) get explicit exception maps.

const LOWER_A = 'a'.charCodeAt(0);
const UPPER_A = 'A'.charCodeAt(0);
const DIGIT_0 = '0'.charCodeAt(0);

interface BuildOpts {
  baseLower?: number;
  baseUpper?: number;
  baseDigit?: number | null;
  exLower?: Record<string, string>;
  exUpper?: Record<string, string>;
}

// Returns a transform that maps a..z / A..Z / 0..9 to the given Unicode block,
// honouring per-letter exceptions, and passes everything else through unchanged.
function build({ baseLower, baseUpper, baseDigit = null, exLower = {}, exUpper = {} }: BuildOpts) {
  return (input: string): string =>
    Array.from(input)
      .map((ch) => {
        const code = ch.charCodeAt(0);
        if (ch >= 'a' && ch <= 'z') {
          if (exLower[ch]) return exLower[ch];
          return baseLower ? String.fromCodePoint(baseLower + (code - LOWER_A)) : ch;
        }
        if (ch >= 'A' && ch <= 'Z') {
          if (exUpper[ch]) return exUpper[ch];
          return baseUpper ? String.fromCodePoint(baseUpper + (code - UPPER_A)) : ch;
        }
        if (ch >= '0' && ch <= '9') {
          return baseDigit ? String.fromCodePoint(baseDigit + (code - DIGIT_0)) : ch;
        }
        return ch;
      })
      .join('');
}

// Explicit small-caps map (lowercase + uppercase both fold to small caps).
const SMALL_CAPS: Record<string, string> = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
  j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: ' q', r: 'ʀ',
  s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
};

export function toSmallCaps(input: string): string {
  return Array.from(input)
    .map((ch) => SMALL_CAPS[ch.toLowerCase()] ?? ch)
    .join('');
}

export interface TextStyle {
  name: string;
  transform: (s: string) => string;
}

// Bold family — reused by both fancy-text and bold-text tools.
export const BOLD_STYLES: TextStyle[] = [
  { name: 'Bold', transform: build({ baseLower: 0x1d41a, baseUpper: 0x1d400, baseDigit: 0x1d7ce }) },
  { name: 'Bold Italic', transform: build({ baseLower: 0x1d482, baseUpper: 0x1d468 }) },
  { name: 'Bold Sans', transform: build({ baseLower: 0x1d5ee, baseUpper: 0x1d5d4, baseDigit: 0x1d7ec }) },
  { name: 'Bold Sans Italic', transform: build({ baseLower: 0x1d656, baseUpper: 0x1d63c }) },
  { name: 'Bold Script', transform: build({ baseLower: 0x1d4ea, baseUpper: 0x1d4d0 }) },
  { name: 'Bold Fraktur', transform: build({ baseLower: 0x1d586, baseUpper: 0x1d56c }) },
];

// The full fancy-text palette.
export const FANCY_STYLES: TextStyle[] = [
  { name: 'Bold', transform: build({ baseLower: 0x1d41a, baseUpper: 0x1d400, baseDigit: 0x1d7ce }) },
  { name: 'Italic', transform: build({ baseLower: 0x1d44e, baseUpper: 0x1d434, exLower: { h: 'ℎ' } }) },
  { name: 'Bold Italic', transform: build({ baseLower: 0x1d482, baseUpper: 0x1d468 }) },
  {
    name: 'Script',
    transform: build({
      baseLower: 0x1d4b6,
      baseUpper: 0x1d49c,
      exLower: { e: 'ℯ', g: 'ℊ', o: 'ℴ' },
      exUpper: { B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ' },
    }),
  },
  { name: 'Bold Script', transform: build({ baseLower: 0x1d4ea, baseUpper: 0x1d4d0 }) },
  {
    name: 'Fraktur',
    transform: build({
      baseLower: 0x1d51e,
      baseUpper: 0x1d504,
      exUpper: { C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ' },
    }),
  },
  { name: 'Bold Fraktur', transform: build({ baseLower: 0x1d586, baseUpper: 0x1d56c }) },
  {
    name: 'Double-struck',
    transform: build({
      baseLower: 0x1d552,
      baseUpper: 0x1d538,
      baseDigit: 0x1d7d8,
      exUpper: { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' },
    }),
  },
  { name: 'Sans-serif', transform: build({ baseLower: 0x1d5ba, baseUpper: 0x1d5a0, baseDigit: 0x1d7e2 }) },
  { name: 'Bold Sans', transform: build({ baseLower: 0x1d5ee, baseUpper: 0x1d5d4, baseDigit: 0x1d7ec }) },
  { name: 'Italic Sans', transform: build({ baseLower: 0x1d622, baseUpper: 0x1d608 }) },
  { name: 'Monospace', transform: build({ baseLower: 0x1d68a, baseUpper: 0x1d670, baseDigit: 0x1d7f6 }) },
  { name: 'Circled', transform: build({ baseLower: 0x24d0, baseUpper: 0x24b6 }) },
  { name: 'Fullwidth', transform: build({ baseLower: 0xff41, baseUpper: 0xff21, baseDigit: 0xff10 }) },
  { name: 'Small Caps', transform: toSmallCaps },
];

// Upside-down: flip each glyph then reverse the whole string.
const FLIP_MAP: Record<string, string> = {
  a: 'ɐ', b: 'q', c: 'ɔ', d: 'p', e: 'ǝ', f: 'ɟ', g: 'ƃ', h: 'ɥ', i: 'ᴉ', j: 'ɾ',
  k: 'ʞ', l: 'l', m: 'ɯ', n: 'u', o: 'o', p: 'd', q: 'b', r: 'ɹ', s: 's', t: 'ʇ',
  u: 'n', v: 'ʌ', w: 'ʍ', x: 'x', y: 'ʎ', z: 'z',
  A: '∀', B: 'ᗺ', C: 'Ɔ', D: 'ᗡ', E: 'Ǝ', F: 'Ⅎ', G: '⅁', H: 'H', I: 'I', J: 'ſ',
  K: 'ʞ', L: '˥', M: 'W', N: 'N', O: 'O', P: 'Ԁ', Q: 'Ò', R: 'ᴚ', S: 'S', T: '⊥',
  U: '∩', V: 'Λ', W: 'M', X: 'X', Y: '⅄', Z: 'Z',
  '0': '0', '1': 'Ɩ', '2': 'ᄅ', '3': 'Ɛ', '4': 'ㄣ', '5': 'ϛ', '6': '9', '7': 'ㄥ', '8': '8', '9': '6',
  '.': '˙', ',': "'", "'": ',', '"': '„', '?': '¿', '!': '¡', '(': ')', ')': '(',
  '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '&': '⅋', '_': '‾',
};

export function toUpsideDown(input: string): string {
  return Array.from(input)
    .map((ch) => FLIP_MAP[ch] ?? ch)
    .reverse()
    .join('');
}

// Combining-mark overlays for the strikethrough tool.
export type StrikeMode = 'strike' | 'slash' | 'underline';

const STRIKE_COMBINER: Record<StrikeMode, string> = {
  strike: '̶', // long stroke overlay
  slash: '̷', // short solidus overlay
  underline: '̲', // low line
};

export function applyStrike(input: string, mode: StrikeMode): string {
  const combiner = STRIKE_COMBINER[mode];
  return Array.from(input)
    .map((ch) => (ch === ' ' || ch === '\n' ? ch : ch + combiner))
    .join('');
}

export const STRIKE_STYLES: TextStyle[] = [
  { name: 'Strikethrough', transform: (s) => applyStrike(s, 'strike') },
  { name: 'Slashed', transform: (s) => applyStrike(s, 'slash') },
  { name: 'Underline', transform: (s) => applyStrike(s, 'underline') },
];

// Superscript / subscript ("tiny text") maps — small raised/lowered glyphs.
const SUPER_MAP: Record<string, string> = {
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ',
  j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', q: 'q', r: 'ʳ',
  s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
};

const SUB_MAP: Record<string, string> = {
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ',
  o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
};

function mapWith(map: Record<string, string>): (s: string) => string {
  return (input: string) =>
    Array.from(input)
      .map((ch) => map[ch] ?? map[ch.toLowerCase()] ?? ch)
      .join('');
}

export const TINY_STYLES: TextStyle[] = [
  { name: 'Superscript (tiny high)', transform: mapWith(SUPER_MAP) },
  { name: 'Subscript (tiny low)', transform: mapWith(SUB_MAP) },
  { name: 'Small Caps', transform: toSmallCaps },
];
