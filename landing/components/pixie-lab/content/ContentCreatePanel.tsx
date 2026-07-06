'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Upload, Image as ImageIcon, Film, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { contentApi } from '@/lib/pixie-lab/servicesClient';

const ACCENT = '#D4AF37';
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB — base64 in a single JSON body

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * ContentCreatePanel — file upload card for the Content agent.
 * Browser reads the selected file via FileReader, strips the data-URL prefix,
 * and passes raw base64 + metadata to contentApi.upload.
 * Storage gating (offline / unconfigured) is already handled upstream in
 * ContentWorkspace, so this panel only needs to handle upload-call failures.
 */
export function ContentCreatePanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Revoke the preview object URL when the component unmounts (e.g. navigate
  // away mid-upload) so we never leak it.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      setError(`File is too large (${formatSize(f.size)}). Max is ${formatSize(MAX_UPLOAD_BYTES)}.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    // Revoke previous object URL to avoid leaks
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setError(null);
    setSuccess(false);
    setPreview(URL.createObjectURL(f));
  }

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setCaption('');
    setTags('');
    setError(null);
    setSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function upload() {
    if (!file) { setError('Please select a file first.'); return; }
    setBusy(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      // Strip "data:<mime>;base64," prefix
      const base64 = dataUrl.split(',')[1];
      const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
      const metadata: Record<string, unknown> = {};
      if (caption.trim()) metadata.caption = caption.trim();
      if (tagList.length) metadata.tags = tagList;

      const d = await contentApi.upload(
        file.name,
        file.type,
        base64,
        Object.keys(metadata).length ? metadata : undefined,
      );
      setBusy(false);
      if (!d.backendUp) {
        setError('Content service is offline. Please try again later.');
        return;
      }
      if (d.status === 'ok' || d.status === 'uploaded' || d.asset) {
        setSuccess(true);
      } else {
        setError(d.error || 'Upload failed — please try again.');
      }
    };
    reader.onerror = () => {
      setBusy(false);
      setError('Could not read the selected file.');
    };
    reader.readAsDataURL(file);
  }

  const inputClass =
    'w-full rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)] transition';

  /* ── Success state ── */
  if (success) {
    return (
      <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-8 text-center">
        <span
          className="mx-auto grid h-14 w-14 place-items-center rounded-2xl"
          style={{ background: `${ACCENT}1a`, color: ACCENT }}
        >
          <CheckCircle2 size={24} />
        </span>
        <p className="mt-4 font-display text-[1.1rem] font-extrabold tracking-tight text-[var(--pl-text)]">
          Upload successful
        </p>
        <p className="mt-1.5 text-[13.5px] text-[var(--pl-text-muted)]">
          Your file has been saved to the media library.
        </p>
        <div className="mt-5 flex justify-center gap-3 flex-wrap">
          <Link
            href="/pixie-lab/content/library"
            className="rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-[#02120f] transition"
            style={{ background: ACCENT }}
          >
            View Library
          </Link>
          <button
            onClick={reset}
            className="rounded-xl border border-[var(--pl-border)] px-4 py-2.5 text-[13.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]"
          >
            Upload another
          </button>
        </div>
      </div>
    );
  }

  const isVideo = file?.type.startsWith('video/');
  const isImage = file?.type.startsWith('image/');

  /* ── Upload form ── */
  return (
    <div className="space-y-4">
      {/* Drop zone / file picker */}
      <div
        role="button"
        tabIndex={0}
        className="relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--pl-border)] bg-[var(--pl-surface)] p-6 text-center transition hover:border-[var(--pl-border-strong)]"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
      >
        {preview && isImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Preview" className="max-h-48 max-w-full rounded-xl object-contain" />
        )}
        {preview && isVideo && (
          <video src={preview} className="max-h-48 max-w-full rounded-xl" controls />
        )}
        {!preview && (
          <>
            <span
              className="grid h-12 w-12 place-items-center rounded-2xl"
              style={{ background: `${ACCENT}1a`, color: ACCENT }}
            >
              <Upload size={22} />
            </span>
            <div>
              <p className="font-display text-[15px] font-bold text-[var(--pl-text)]">
                Click to choose a file
              </p>
              <p className="mt-0.5 text-[12.5px] text-[var(--pl-text-muted)]">
                Images and videos — jpg, png, mp4, mov, webm
              </p>
            </div>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="sr-only"
          onChange={onFileChange}
        />
      </div>

      {/* File chip */}
      {file && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2">
          <span style={{ color: ACCENT }}>
            {isVideo ? <Film size={16} /> : <ImageIcon size={16} />}
          </span>
          <span className="flex-1 truncate text-[13px] text-[var(--pl-text)]">{file.name}</span>
          <span className="shrink-0 text-[12px] text-[var(--pl-text-muted)]">{formatSize(file.size)}</span>
          <button
            onClick={(e) => { e.stopPropagation(); reset(); }}
            className="ml-1 shrink-0 text-[12px] text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]"
            aria-label="Remove file"
          >
            ✕
          </button>
        </div>
      )}

      {/* Caption */}
      <div>
        <label className="mb-1.5 block text-[12.5px] font-semibold text-[var(--pl-text-muted)]">
          Caption / idea <span className="font-normal opacity-70">(optional)</span>
        </label>
        <textarea
          className={`${inputClass} resize-none`}
          rows={2}
          placeholder="Describe this asset or add a caption…"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
      </div>

      {/* Tags */}
      <div>
        <label className="mb-1.5 block text-[12.5px] font-semibold text-[var(--pl-text-muted)]">
          Tags <span className="font-normal opacity-70">(comma-separated, optional)</span>
        </label>
        <input
          className={inputClass}
          placeholder="brand, summer, product"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </div>

      {/* AI caption — coming soon affordance (disabled, clearly labelled) */}
      <div className="flex cursor-not-allowed items-center gap-2.5 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3.5 py-2.5 opacity-55 select-none">
        <Sparkles size={15} style={{ color: ACCENT, flexShrink: 0 }} />
        <span className="text-[13px] text-[var(--pl-text-soft)]">AI caption generation</span>
        <span className="ml-auto shrink-0 rounded-full border border-[var(--pl-border)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[var(--pl-text-muted)]">
          Coming soon
        </span>
      </div>

      {error && (
        <p className="text-[12.5px] text-amber-500">{error}</p>
      )}

      <button
        onClick={upload}
        disabled={busy || !file}
        className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-bold text-[#02120f] transition disabled:opacity-50"
        style={{ background: ACCENT }}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
        Upload to library
      </button>
    </div>
  );
}
