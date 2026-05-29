'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  value: string;
  label?: string;
  size?: 'sm' | 'xs';
  className?: string;
}

// Shared copy-to-clipboard button matching the existing tool widgets'
// green button + Check/Copy icon + 1.8s "Copied" reset behaviour.
export function CopyButton({ value, label = 'Copy', size = 'sm', className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable
    }
  };

  const pad = size === 'xs' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs';
  const icon = size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!value}
      className={`inline-flex items-center gap-1.5 rounded-lg bg-wa-green ${pad} font-semibold text-white transition hover:bg-wa-greenDark disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {copied ? (
        <>
          <Check className={icon} />
          Copied
        </>
      ) : (
        <>
          <Copy className={icon} />
          {label}
        </>
      )}
    </button>
  );
}
