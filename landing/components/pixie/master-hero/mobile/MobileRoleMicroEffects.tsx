'use client';

import {
  PhoneCall,
  CalendarCheck,
  LayoutTemplate,
  Smartphone,
  Heart,
  Play,
  Camera,
  Sparkles,
  BarChart3,
  Gauge,
  Share2,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';

/**
 * MobileRoleMicroEffects — tiny, role-specific accent details that pop in
 * around the avatar (once, on scene enter). Lightweight glass chips + a thin
 * accent line for the technical roles. Pure CSS reveal (.m-micro), transform/
 * opacity only, no particles/canvas. Decorative → aria-hidden.
 *
 * Each item: [top%, left%, Icon, delayMs]. Positions stay inside the avatar
 * stage so nothing overflows the viewport.
 */
type Item = { t: number; l: number; Icon: LucideIcon; d: number };

const CHIPS: Record<string, Item[]> = {
  greeter: [
    { t: 14, l: 4, Icon: PhoneCall, d: 220 },
    { t: 30, l: 80, Icon: CalendarCheck, d: 320 },
  ],
  architect: [
    { t: 12, l: 78, Icon: LayoutTemplate, d: 220 },
    { t: 40, l: 2, Icon: Smartphone, d: 340 },
  ],
  creator: [
    { t: 12, l: 6, Icon: Heart, d: 220 },
    { t: 26, l: 82, Icon: Play, d: 340 },
  ],
  star: [
    { t: 12, l: 80, Icon: Camera, d: 220 },
    { t: 30, l: 2, Icon: Sparkles, d: 340 },
  ],
  analyst: [
    { t: 14, l: 4, Icon: BarChart3, d: 220 },
    { t: 32, l: 80, Icon: Gauge, d: 340 },
  ],
  core: [
    { t: 12, l: 6, Icon: Share2, d: 220 },
    { t: 22, l: 82, Icon: MessageSquare, d: 320 },
  ],
};

const HAS_LINE = new Set(['architect', 'analyst']); // a thin accent scan line

export function MobileRoleMicroEffects({ roleId }: { roleId: string }) {
  const chips = CHIPS[roleId] ?? [];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {HAS_LINE.has(roleId) && <span className="m-micro m-micro-line" style={{ animationDelay: '300ms' }} />}
      {chips.map(({ t, l, Icon, d }, i) => (
        <span key={i} className="m-micro m-micro-chip" style={{ top: `${t}%`, left: `${l}%`, animationDelay: `${d}ms` }}>
          <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
        </span>
      ))}
    </div>
  );
}
