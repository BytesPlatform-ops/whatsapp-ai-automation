import type { Metadata } from 'next';
import { SeoHistory } from '@/components/seo/SeoHistory';
export const metadata: Metadata = { title: 'Pixie · SEO History', description: 'Past SEO audits.', robots: { index: false, follow: false } };
export default function Page() { return <SeoHistory />; }
