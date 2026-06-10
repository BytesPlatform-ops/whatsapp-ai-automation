'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2, Upload } from 'lucide-react';
import { CopyButton } from '@/components/tools/widgets/CopyButton';
import { loadScript } from '@/lib/loadScript';

const PDFJS_VERSION = '3.11.174';
const PDFJS_SRC = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.js`;
const PDFJS_WORKER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function extractPdfText(
  file: File,
  onProgress: (page: number, total: number) => void,
): Promise<string> {
  await loadScript(PDFJS_SRC);
  const pdfjsLib = (window as any).pdfjsLib;
  if (!pdfjsLib) throw new Error('PDF engine failed to load. Check your connection and retry.');
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

  const data = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    onProgress(p, doc.numPages);
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let line = '';
    for (const item of content.items as any[]) {
      const y = item.transform?.[5];
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) {
        out.push(line.trimEnd());
        line = '';
      }
      line += item.str;
      if (item.hasEOL) {
        out.push(line.trimEnd());
        line = '';
      }
      lastY = y ?? lastY;
    }
    if (line) out.push(line.trimEnd());
    out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function PdfToTextWidget() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ page: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please choose a PDF file.');
      return;
    }
    setError(null);
    setText('');
    setFileName(file.name);
    setLoading(true);
    setProgress({ page: 0, total: 0 });
    try {
      const result = await extractPdfText(file, (page, total) => setProgress({ page, total }));
      setText(result);
      if (!result) {
        setError('No selectable text found — this looks like a scanned PDF. Try the Image to Text (OCR) tool on a screenshot of the page.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this PDF.');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-ink-200 bg-ink-50 px-6 py-10 text-center"
      >
        <Upload className="mb-3 h-8 w-8 text-ink-400" />
        <p className="text-sm font-semibold text-ink-700">Drop a PDF here, or</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-wa-green px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-greenDark"
        >
          <FileText className="h-4 w-4" />
          Choose PDF
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {fileName && <p className="mt-3 max-w-full truncate text-xs text-ink-500">{fileName}</p>}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-ink-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          {progress && progress.total > 0
            ? `Extracting page ${progress.page} of ${progress.total}…`
            : 'Loading PDF engine…'}
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
            rows={12}
            className="w-full resize-y rounded-xl border border-ink-200 bg-white px-4 py-3 font-mono text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
        </div>
      )}

      <p className="text-xs text-ink-400">
        Tip: everything runs in your browser — your PDF is never uploaded to a server. For scanned
        documents or images, use the{' '}
        <Link href="/tools/image-to-text" className="font-semibold text-wa-teal hover:underline">
          Image to Text (OCR)
        </Link>{' '}
        tool instead.
      </p>
    </div>
  );
}
