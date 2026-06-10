// Loads an external browser library from a CDN exactly once and resolves when a
// given global is ready. Used by the PDF→Text (pdf.js) and Image→Text (Tesseract)
// widgets so we pull heavy WASM/parsing libs lazily in the browser instead of
// shipping them in the bundle. Client-side only.

const loaded = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('loadScript is browser-only'));
  }
  const existing = loaded.get(src);
  if (existing) return existing;

  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      loaded.delete(src); // allow a retry on next call
      reject(new Error(`Failed to load script: ${src}`));
    };
    document.head.appendChild(el);
  });

  loaded.set(src, p);
  return p;
}
