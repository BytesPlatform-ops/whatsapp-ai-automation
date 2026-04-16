// Shared hero-text-palette helpers used by both the generic (business-starter)
// template and the niche templates (salon, real-estate). Decides whether hero
// overlay text should render white-on-dark or near-black-on-light based on the
// combined luminance of the primaryColor + Unsplash dominantColor. Also emits
// a ready-to-interpolate overlay gradient keyed to the same decision.

function relativeLuminance(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6 && h.length !== 3) return 0;
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// Dark text on light bg when isLight, otherwise white on dark. Override lets
// callers force a palette (used when the user's revision explicitly asks for
// a light/pastel colour that should always pair with dark text, or vice versa).
function heroTextPalette(bgColor, override) {
  let isLight;
  if (override === 'dark') isLight = true;
  else if (override === 'light') isLight = false;
  else isLight = relativeLuminance(bgColor) > 0.55;

  return isLight
    ? {
        isDark: true,
        fg: '#0f172a',
        fgSoft: 'rgba(15,23,42,0.75)',
        fgMuted: 'rgba(15,23,42,0.55)',
        border: 'rgba(15,23,42,0.18)',
        glassBg: 'rgba(255,255,255,0.4)',
        buttonBg: '#0f172a',
        buttonFg: '#fff',
      }
    : {
        isDark: false,
        fg: '#fff',
        fgSoft: 'rgba(255,255,255,0.85)',
        fgMuted: 'rgba(255,255,255,0.55)',
        border: 'rgba(255,255,255,0.3)',
        glassBg: 'rgba(255,255,255,0.08)',
        buttonBg: '#fff',
        buttonFg: bgColor,
      };
}

// For templates that lay text on top of an Unsplash hero image with a tinted
// overlay (salon, real-estate, generic): compute the effective hero brightness
// by blending primaryColor's luminance (70%) with the Unsplash-reported
// dominantColor (30%), then decide the palette. Returns the palette plus the
// effective hex used to pick it and a reasonable overlay gradient.
function computeHeroPaletteFromConfig(c) {
  const pc = c.primaryColor || '#2563EB';
  const img = c.heroImage && c.heroImage.dominantColor;
  let effective = pc;
  if (img) {
    const imgLum = relativeLuminance(img);
    const pcLum = relativeLuminance(pc);
    // Overlay is heavy on primary colour but the image shows through enough
    // that a bright photo can still wash out white text — hence the blend.
    const effLum = pcLum * 0.7 + imgLum * 0.3;
    const g = Math.round(Math.sqrt(effLum) * 255).toString(16).padStart(2, '0');
    effective = `#${g}${g}${g}`;
  }
  const pal = heroTextPalette(effective, c.heroTextOverride);
  return { ...pal, effective };
}

module.exports = { relativeLuminance, heroTextPalette, computeHeroPaletteFromConfig };
