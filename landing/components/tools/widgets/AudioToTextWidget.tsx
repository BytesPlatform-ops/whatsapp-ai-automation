'use client';

import { useRef, useState } from 'react';
import { Loader2, Mic, Upload } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';

const LANGS = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ar', label: 'Arabic' },
];

const MAX_MB = 25;

export function AudioToTextWidget() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [language, setLanguage] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');

  const transcribe = async (file: File) => {
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Audio file is too large (max ${MAX_MB} MB).`);
      return;
    }
    setError(null);
    setText('');
    setFileName(file.name);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('language', language);
      const res = await fetch('/api/tools/audio-to-text', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { text: string };
      setText(data.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
      setError('Please choose an audio file (mp3, m4a, wav, etc.).');
      return;
    }
    transcribe(file);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="a2t-lang" className="mb-2 block text-sm font-semibold text-ink-700">
            Language
          </label>
          <select
            id="a2t-lang"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
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
        <Mic className="mb-3 h-8 w-8 text-ink-400" />
        <p className="text-sm font-semibold text-ink-700">Drop an audio file here, or</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-wa-green px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-greenDark disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          Choose audio
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,video/mp4,video/webm,.mp3,.m4a,.wav,.ogg,.flac"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {fileName && <p className="mt-3 max-w-full truncate text-xs text-ink-500">{fileName}</p>}
        <p className="mt-2 text-[11px] text-ink-400">mp3, m4a, wav, ogg, flac, webm · up to {MAX_MB} MB</p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-ink-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Transcribing… longer recordings take a little while.
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          {error}
        </div>
      )}

      {text && (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/15">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-900">Transcript</h3>
            <CopyButton value={text} size="xs" />
          </div>
          <p className="whitespace-pre-wrap text-base leading-relaxed text-ink-800">{text}</p>

          {(() => {
            const cta = buildToolPrefill('audio-to-text', {});
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      )}

      <p className="text-xs text-ink-400">
        Tip: clear recordings with little background noise transcribe most accurately. Your audio is
        sent securely for transcription and is not stored.
      </p>
    </div>
  );
}
