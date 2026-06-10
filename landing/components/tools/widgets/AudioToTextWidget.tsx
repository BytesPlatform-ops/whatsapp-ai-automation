'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, RotateCcw, Square, Upload } from 'lucide-react';
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
const MAX_RECORD_SECONDS = 600; // 10 min — well under the 25 MB ceiling at opus bitrates

// Pick a recording container the browser supports, plus a matching file extension
// the Whisper route accepts (webm / ogg / m4a are all allowed).
function pickRecordingType(): { mimeType?: string; ext: string } {
  if (typeof MediaRecorder === 'undefined') return { ext: 'webm' };
  const candidates: { mimeType: string; ext: string }[] = [
    { mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
    { mimeType: 'audio/webm', ext: 'webm' },
    { mimeType: 'audio/ogg;codecs=opus', ext: 'ogg' },
    { mimeType: 'audio/mp4', ext: 'm4a' },
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
    } catch {
      /* isTypeSupported can throw on odd inputs — skip */
    }
  }
  return { ext: 'webm' };
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioToTextWidget() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'upload' | 'record'>('upload');
  const [language, setLanguage] = useState('auto');
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');

  // recording state
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const recordedFileRef = useRef<File | null>(null);
  const recordedUrlRef = useRef('');

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  const clearRecordedUrl = () => {
    if (recordedUrlRef.current) {
      URL.revokeObjectURL(recordedUrlRef.current);
      recordedUrlRef.current = '';
    }
  };

  // Tidy up streams, timers, and object URLs if the component unmounts mid-record.
  useEffect(() => {
    return () => {
      try {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      } catch {
        /* ignore */
      }
      stopTracks();
      clearTimer();
      clearRecordedUrl();
    };
  }, []);

  const transcribe = async (file: File) => {
    if (file.size === 0) {
      setError('The recording is empty — try again.');
      return;
    }
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

  const startRecording = async () => {
    setError(null);
    setText('');
    clearRecordedUrl();
    setRecordedUrl('');
    recordedFileRef.current = null;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Recording is not supported in this browser. Upload a file instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const { mimeType, ext } = pickRecordingType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        clearTimer();
        stopTracks();
        const type = mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        recordedFileRef.current = new File([blob], `recording.${ext}`, { type });
        const url = URL.createObjectURL(blob);
        recordedUrlRef.current = url;
        setRecordedUrl(url);
        setRecording(false);
      };
      recorder.start();
      recorderRef.current = recorder;
      elapsedRef.current = 0;
      setElapsed(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
        if (elapsedRef.current >= MAX_RECORD_SECONDS) stopRecording();
      }, 1000);
    } catch (err) {
      stopTracks();
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Microphone access was blocked. Allow mic permission and try again.');
      } else if (name === 'NotFoundError') {
        setError('No microphone found. Connect one or upload a file instead.');
      } else {
        setError('Could not start recording. Upload a file instead.');
      }
    }
  };

  const stopRecording = () => {
    clearTimer();
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop(); // fires onstop, which builds the file
      }
    } catch {
      stopTracks();
      setRecording(false);
    }
  };

  const discardRecording = () => {
    clearRecordedUrl();
    setRecordedUrl('');
    recordedFileRef.current = null;
    elapsedRef.current = 0;
    setElapsed(0);
    setError(null);
  };

  const switchMode = (m: 'upload' | 'record') => {
    if (m !== 'record' && recording) stopRecording();
    setMode(m);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
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
        <div>
          <span className="mb-2 block text-sm font-semibold text-ink-700">Source</span>
          <div className="inline-flex rounded-full bg-ink-100 p-1">
            {(['upload', 'record'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${
                  mode === m ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
                }`}
              >
                {m === 'upload' ? 'Upload file' : 'Record'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === 'upload' && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-ink-200 bg-ink-50 px-6 py-10 text-center"
        >
          <Upload className="mb-3 h-8 w-8 text-ink-400" />
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
      )}

      {mode === 'record' && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-ink-200 bg-ink-50 px-6 py-10 text-center">
          {!recording && !recordedUrl && (
            <>
              <Mic className="mb-3 h-8 w-8 text-ink-400" />
              <p className="text-sm font-semibold text-ink-700">Record straight from your microphone</p>
              <button
                type="button"
                onClick={startRecording}
                disabled={loading}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-wa-green px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-greenDark disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Mic className="h-4 w-4" />
                Start recording
              </button>
              <p className="mt-2 text-[11px] text-ink-400">up to 10 min · your browser will ask for mic permission</p>
            </>
          )}

          {recording && (
            <>
              <span className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-red-600">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
                Recording
              </span>
              <div className="font-mono text-3xl font-bold text-ink-900" aria-live="polite">
                {fmt(elapsed)}
              </div>
              <button
                type="button"
                onClick={stopRecording}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700"
              >
                <Square className="h-4 w-4" />
                Stop
              </button>
            </>
          )}

          {!recording && recordedUrl && (
            <>
              <p className="mb-3 text-sm font-semibold text-ink-700">Recording ready ({fmt(elapsed)})</p>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls src={recordedUrl} className="w-full max-w-md" />
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => recordedFileRef.current && transcribe(recordedFileRef.current)}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-wa-green px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-greenDark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Mic className="h-4 w-4" />
                  Transcribe recording
                </button>
                <button
                  type="button"
                  onClick={discardRecording}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:border-wa-green/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Re-record
                </button>
              </div>
            </>
          )}
        </div>
      )}

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
        Tip: clear recordings with little background noise transcribe most accurately. Recording uses
        your device mic and needs permission; your audio is sent securely for transcription and is
        not stored.
      </p>
    </div>
  );
}
