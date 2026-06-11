'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';

type Format = 'image/jpeg' | 'image/png' | 'image/webp';
const FORMATS: { id: Format; label: string }[] = [
  { id: 'image/jpeg', label: 'JPG' },
  { id: 'image/png', label: 'PNG' },
  { id: 'image/webp', label: 'WebP' },
];

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function ImageResizerWidget() {
  const inputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const [hasImage, setHasImage] = useState(false);
  const [origName, setOrigName] = useState('image');
  const [origSize, setOrigSize] = useState(0);
  const [natW, setNatW] = useState(0);
  const [natH, setNatH] = useState(0);
  const [width, setWidth] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);
  const [format, setFormat] = useState<Format>('image/jpeg');
  const [quality, setQuality] = useState(0.85);
  const [outSize, setOutSize] = useState(0);
  const [outUrl, setOutUrl] = useState('');

  const height = lockAspect && natW ? Math.round((width * natH) / natW) : natH;

  const render = useCallback(() => {
    const img = imgRef.current;
    if (!img || !width) return;
    const h = lockAspect && natW ? Math.round((width * natH) / natW) : natH;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, width, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        blobRef.current = blob;
        setOutSize(blob.size);
        setOutUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      },
      format,
      format === 'image/png' ? undefined : quality,
    );
  }, [width, lockAspect, natW, natH, format, quality]);

  useEffect(() => {
    if (hasImage) render();
  }, [hasImage, render]);

  const handleFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    setOrigName(file.name.replace(/\.[^.]+$/, ''));
    setOrigSize(file.size);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setNatW(img.naturalWidth);
      setNatH(img.naturalHeight);
      setWidth(img.naturalWidth);
      setHasImage(true);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png';

  return (
    <div className="space-y-5">
      {!hasImage ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-ink-200 bg-ink-50 px-6 py-10 text-center"
        >
          <Upload className="mb-3 h-8 w-8 text-ink-400" />
          <p className="text-sm font-semibold text-ink-700">Drop an image here, or</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-wa-green px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-greenDark"
          >
            <Upload className="h-4 w-4" />
            Choose image
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ir-width" className="mb-2 block text-sm font-semibold text-ink-700">
                Width (px)
              </label>
              <input
                id="ir-width"
                type="number"
                min={1}
                max={natW * 2}
                value={width}
                onChange={(e) => setWidth(Math.max(1, Number(e.target.value)))}
                className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
              />
            </div>
            <div>
              <span className="mb-2 block text-sm font-semibold text-ink-700">Height (px)</span>
              <div className="rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm text-ink-700">{height}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={lockAspect} onChange={(e) => setLockAspect(e.target.checked)} className="accent-wa-green" />
              Lock aspect ratio
            </label>
            <div className="inline-flex rounded-full bg-ink-100 p-1">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                    format === f.id ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {format !== 'image/png' && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="ir-q" className="text-sm font-semibold text-ink-700">Quality</label>
                <span className="text-xs font-semibold text-ink-500">{Math.round(quality * 100)}%</span>
              </div>
              <input id="ir-q" type="range" min={0.1} max={1} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full accent-wa-green" />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm">
            <span className="text-ink-500">Original: <span className="font-semibold text-ink-800">{natW}×{natH}</span> · {fmtBytes(origSize)}</span>
            <span aria-hidden className="text-ink-300">→</span>
            <span className="text-ink-500">New: <span className="font-semibold text-ink-800">{width}×{height}</span> · {fmtBytes(outSize)}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={outUrl || undefined}
              download={`${origName}-${width}x${height}.${ext}`}
              className={`inline-flex items-center gap-1.5 rounded-xl bg-wa-green px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-greenDark ${!outUrl ? 'pointer-events-none opacity-50' : ''}`}
            >
              <Download className="h-4 w-4" />
              Download {FORMATS.find((f) => f.id === format)?.label}
            </a>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:border-wa-green/40"
            >
              Change image
            </button>
          </div>

          {outUrl && (
            <div className="overflow-hidden rounded-xl border border-ink-200 bg-ink-50 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={outUrl} alt="Resized preview" className="mx-auto max-h-64 w-auto" />
            </div>
          )}
        </>
      )}

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />

      <p className="text-xs text-ink-400">
        Tip: everything runs in your browser — your image is never uploaded. JPG and WebP let you trade
        quality for a smaller file; PNG keeps transparency.
      </p>
    </div>
  );
}
