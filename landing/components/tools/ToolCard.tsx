import Link from 'next/link';
import type { ToolDefinition } from '@/lib/tools';

interface ToolCardProps {
  tool: ToolDefinition;
  compact?: boolean;
}

export function ToolCard({ tool, compact = false }: ToolCardProps) {
  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-soft transition-all hover:-translate-y-0.5 hover:border-wa-green/40 hover:shadow-card"
    >
      {/* Hero image */}
      <div className="relative aspect-[16/9] overflow-hidden bg-ink-50">
        <img
          src={tool.image}
          alt={tool.imageAlt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute left-4 top-4 rounded-full bg-white/95 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-700 shadow-soft backdrop-blur">
          {tool.category}
        </span>
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-col p-6">
        <h3 className="font-display text-xl font-bold text-ink-900 group-hover:text-wa-teal">
          {tool.shortName}
        </h3>

        {!compact && (
          <p className="mt-2 text-sm leading-relaxed text-ink-500">{tool.tagline}</p>
        )}

        <div className="mt-auto pt-4">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-wa-teal transition-all group-hover:gap-2.5">
            Use tool
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}
