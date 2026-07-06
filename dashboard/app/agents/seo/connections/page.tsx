import type { Metadata } from 'next';
import { SeoConnections } from '@/components/seo/SeoConnections';
export const metadata: Metadata = { title: 'Pixie · SEO Connections', description: 'Connect WordPress, Shopify, Webflow and more for one-tap SEO.', robots: { index: false, follow: false } };
export default function Page() { return <SeoConnections />; }
