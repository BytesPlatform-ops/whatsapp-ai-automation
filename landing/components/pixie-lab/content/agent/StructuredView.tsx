'use client';

import type { ContentType } from '@/lib/pixie-lab/contentAgentTypes';

/**
 * StructuredView — renders a structured payload (carousel / ad copy / SEO)
 * field-by-field. Plain text only — never dangerouslySetInnerHTML, so generated
 * content can never inject markup. Falls back to a definition list for unknown
 * shapes so nothing is silently dropped.
 */
export function StructuredView({ contentType, data }: { contentType: ContentType; data: Record<string, unknown> }) {
  if (!data || Object.keys(data).length === 0) return null;

  if (contentType === 'carousel') return <Carousel data={data} />;
  if (contentType === 'ad_copy') return <AdCopy data={data} />;
  if (contentType === 'seo_content') return <Seo data={data} />;
  return <Generic data={data} />;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--pl-text-muted)]">{label}</p>
      <div className="mt-1 whitespace-pre-wrap text-[13px] text-[var(--pl-text)]">{children}</div>
    </div>
  );
}

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

function Carousel({ data }: { data: Record<string, unknown> }) {
  const slides = Array.isArray(data.slides) ? (data.slides as Array<Record<string, unknown>>) : [];
  return (
    <div className="space-y-2.5">
      {'hook' in data && <Row label="Hook">{str(data.hook)}</Row>}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {slides.map((s, i) => (
          <div key={i} className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] p-3">
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--pl-text-muted)]">Slide {i + 1}{s.title ? ` · ${str(s.title)}` : ''}</p>
            <p className="mt-1 whitespace-pre-wrap text-[13px] text-[var(--pl-text)]">{str(s.body)}</p>
          </div>
        ))}
      </div>
      {'cta' in data && <Row label="CTA">{str(data.cta)}</Row>}
      {'caption' in data && <Row label="Caption">{str(data.caption)}</Row>}
      {'visual_direction' in data && <Row label="Visual direction">{str(data.visual_direction)}</Row>}
    </div>
  );
}

function AdCopy({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-2.5">
      {'headline' in data && <Row label="Headline">{str(data.headline)}</Row>}
      {'primary_text' in data && <Row label="Primary text">{str(data.primary_text)}</Row>}
      {'description' in data && <Row label="Description">{str(data.description)}</Row>}
      {'cta' in data && <Row label="CTA">{str(data.cta)}</Row>}
    </div>
  );
}

function Seo({ data }: { data: Record<string, unknown> }) {
  const sections = Array.isArray(data.sections) ? (data.sections as Array<Record<string, unknown>>) : [];
  return (
    <div className="space-y-2.5">
      {'meta_title' in data && <Row label="Meta title">{str(data.meta_title)}</Row>}
      {'meta_description' in data && <Row label="Meta description">{str(data.meta_description)}</Row>}
      {'h1' in data && <Row label="H1">{str(data.h1)}</Row>}
      {sections.map((s, i) => (
        <Row key={i} label={str(s.heading) || `Section ${i + 1}`}>{str(s.body)}</Row>
      ))}
    </div>
  );
}

function Generic({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-2.5">
      {Object.entries(data).map(([k, v]) => (
        <Row key={k} label={k.replace(/_/g, ' ')}>{typeof v === 'object' ? JSON.stringify(v, null, 2) : str(v)}</Row>
      ))}
    </div>
  );
}
