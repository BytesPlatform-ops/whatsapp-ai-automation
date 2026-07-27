'use client';

import { LayoutGrid } from 'lucide-react';
import type { BillingProductSpec, BillingProductId } from '@/lib/pixie-lab/billingProducts';

interface Props {
  products: BillingProductSpec[];
  activeProduct: BillingProductId | null;
  onSelect: (productId: BillingProductId | null) => void;
}

/**
 * AgentBillingSelector — horizontal pill selector for "All Agents" + each
 * registered/implemented billing product.  Selection is controlled externally
 * (parent drives via activeProduct prop and URL param).
 */
export function AgentBillingSelector({ products, activeProduct, onSelect }: Props) {
  if (products.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Agent billing filter"
      className="flex flex-wrap gap-2"
    >
      {/* All Agents tab */}
      <SelectorTab
        label="All Agents"
        icon={<LayoutGrid size={14} aria-hidden />}
        accent="var(--pl-green)"
        active={activeProduct === null}
        onClick={() => onSelect(null)}
      />

      {/* Per-product tabs */}
      {products.map((spec) => (
        <SelectorTab
          key={spec.productId}
          label={spec.displayName}
          icon={null}
          accent={spec.accent}
          active={activeProduct === spec.productId}
          onClick={() => onSelect(spec.productId)}
        />
      ))}
    </div>
  );
}

interface TabProps {
  label: string;
  icon: React.ReactNode;
  accent: string;
  active: boolean;
  onClick: () => void;
}

function SelectorTab({ label, icon, accent, active, onClick }: TabProps) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        borderColor: active ? accent : 'var(--pl-border)',
        background: active ? `${accent}18` : 'var(--pl-surface)',
        color: active ? accent : 'var(--pl-text-muted)',
        outlineColor: accent,
      }}
    >
      {icon}
      {label}
    </button>
  );
}
