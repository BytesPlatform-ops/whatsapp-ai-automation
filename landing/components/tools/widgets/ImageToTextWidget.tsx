'use client';

import { useRef, useState } from 'react';
import { ImageIcon, Loader2, Upload } from 'lucide-react';
import { CopyButton } from '@/components/tools/widgets/CopyButton';
import { loadScript } from '@/lib/loadScript';

const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

const LANGS = [
  { code: 'eng', label: 'English' },
  { code: 'spa', label: 'Spanish' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
];

export function ImageToTextWidget() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>('');
  const [lang, setLang] = useState('eng');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');

  const runOcr = async (file: File) => {
    setError(null);
    setText('');
    setLoading(true);
    setProgress(0);
    setStatus('Loading OCR engine…');
    try {
      await loadScript(TESSERACT_SRC);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Tesseract = (window as any).Tesseract;
      if (!Tesseract) throw new Error('OCR engine failed to load. Check your connection and retry.');
      const { data } = await Tesseract.recognize(file, lang, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logger: (m: any) => {
          if (m.status) setStatus(m.status);
          if (typeof m.progress === 'number') setProgress(Math.round(m.progress * 100));
        },
      });
      const result = (data?.text ?? '').trim();
      setText(result);
      if (!result) setError('No text detected. Try a sharper, higher-contrast image.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this image.');
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPG, PNG, WebP, etc.).');
      return;
    }
    setPreview(URL.createObjectURL(file));
    runOcr(file);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="ocr-lang" className="mb-2 block text-sm font-semibold text-ink-700">
            Language
          </label>
          <select
            id="ocr-lang"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

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
          <ImageIcon className="h-4 w-4" />
          Choose image
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && <img src={preview} alt="Selected" className="mt-4 max-h-40 rounded-lg" />}
      </div>

      {loading && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-ink-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="capitalize">{status || 'Working'}…</span>
            <span className="ml-auto font-semibold">{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
            <div className="h-full bg-wa-green transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          {error}
        </div>
      )}

      {text && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-ink-700">Extracted text</span>
            <CopyButton value={text} />
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            className="w-full resize-y rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
        </div>
      )}

      <p className="text-xs text-ink-400">
        Tip: OCR runs entirely in your browser — your image is never uploaded. Accuracy is best on
        clear, high-contrast text. Handwriting and low-resolution photos may need a retake.
      </p>
    </div>
  );
}
