import type { Metadata } from 'next';
import { SeoAudit } from '@/components/seo/SeoAudit';
export const metadata: Metadata = { title: 'Pixie · SEO Audit', description: 'Real SEO audit + platform detection + one-tap fixes.', robots: { index: false, follow: false } };
export default function Page() { return <SeoAudit />; }
