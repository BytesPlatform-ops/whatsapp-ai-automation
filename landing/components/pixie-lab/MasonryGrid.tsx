'use client';

import type { ReactNode } from 'react';

/**
 * MasonryGrid — Pinterest-style masonry via CSS columns (no layout lib). Cards of
 * varying heights flow top-to-bottom, filling columns; when a card expands the
 * column reflows naturally. Responsive: 1 → 2 → 3 → 4 columns.
 *
 * Prop-driven + reusable: pass any items + a renderItem. Anas's agent dashboards
 * reuse this with their own cards.
 */
export function MasonryGrid<T>({
  items,
  renderItem,
  loading,
  skeletonCount = 8,
  renderSkeleton,
  emptyState,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  loading?: boolean;
  skeletonCount?: number;
  renderSkeleton?: (i: number) => ReactNode;
  emptyState?: ReactNode;
}) {
  if (loading) {
    return (
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4 [&>*]:mb-4 [&>*]:break-inside-avoid">
        {Array.from({ length: skeletonCount }).map((_, i) =>
          renderSkeleton ? (
            <div key={i}>{renderSkeleton(i)}</div>
          ) : (
            <div
              key={i}
              className="mb-4 break-inside-avoid animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]"
              style={{ height: 90 + ((i * 37) % 90) }}
            />
          ),
        )}
      </div>
    );
  }

  if (!items.length && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4 [&>*]:mb-4 [&>*]:break-inside-avoid">
      {items.map((item, i) => renderItem(item, i))}
    </div>
  );
}
