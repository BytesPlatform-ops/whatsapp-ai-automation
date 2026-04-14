import { waLink } from '@/lib/config';
import { WhatsAppIcon } from './icons/WhatsAppIcon';

type Size = 'sm' | 'md' | 'lg' | 'xl';
type Variant = 'solid' | 'outline' | 'ghost';

const sizeStyles: Record<Size, string> = {
  sm: 'h-10 px-4 text-sm',
  md: 'h-12 px-6 text-base',
  lg: 'h-14 px-7 text-base',
  xl: 'h-16 px-9 text-lg',
};

const iconSize: Record<Size, string> = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-5 h-5',
  xl: 'w-6 h-6',
};

const variantStyles: Record<Variant, string> = {
  solid:
    'bg-wa-green text-white hover:bg-wa-greenDark shadow-[0_8px_24px_-8px_rgba(37,211,102,0.6)] hover:shadow-[0_12px_32px_-8px_rgba(37,211,102,0.7)]',
  outline:
    'bg-transparent text-wa-green border border-wa-green/40 hover:bg-wa-green/5',
  ghost:
    'bg-white text-ink-900 border border-ink-100 hover:border-wa-green/40 hover:text-wa-green',
};

interface WhatsAppButtonProps {
  prefill?: string;
  size?: Size;
  variant?: Variant;
  label?: string;
  className?: string;
  showIcon?: boolean;
}

export function WhatsAppButton({
  prefill,
  size = 'lg',
  variant = 'solid',
  label = 'Start on WhatsApp',
  className = '',
  showIcon = true,
}: WhatsAppButtonProps) {
  return (
    <a
      href={waLink(prefill)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2.5 rounded-full font-semibold transition-all duration-200 active:scale-[0.98] ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {showIcon && <WhatsAppIcon className={iconSize[size]} />}
      <span>{label}</span>
    </a>
  );
}
