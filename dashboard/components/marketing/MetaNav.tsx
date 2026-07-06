'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/agents/marketing/meta', label: 'Overview' },
  { href: '/agents/marketing/meta/content', label: 'Content Library' },
  { href: '/agents/marketing/meta/inbox', label: 'Inbox' },
  { href: '/agents/marketing/meta/comments', label: 'Comments' },
  { href: '/agents/marketing/meta/approvals', label: 'Approvals' },
];

export function MetaNav() {
  const path = usePathname();
  return (
    <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14, marginBottom: 4 }}>
      {TABS.map((t) => {
        const active = path === t.href;
        return (
          <Link key={t.href} href={t.href}
            style={{
              fontSize: 13, fontWeight: active ? 700 : 500, textDecoration: 'none',
              padding: '6px 14px', borderRadius: 999,
              color: active ? '#0b0f1a' : 'rgba(255,255,255,0.75)',
              background: active ? '#c7d2fe' : 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
