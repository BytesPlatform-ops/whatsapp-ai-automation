import type { Metadata } from 'next';
import { getTool } from '@/lib/tools';
import { siteConfig } from '@/lib/config';

export function buildToolMetadata(slug: string): Metadata {
  const tool = getTool(slug);
  if (!tool) {
    throw new Error(`buildToolMetadata: unknown tool slug "${slug}"`);
  }
  const url = `https://${siteConfig.domain}/tools/${tool.slug}`;
  const imageUrl = `https://${siteConfig.domain}${tool.image}`;
  const image = {
    url: imageUrl,
    width: 1200,
    height: 675,
    alt: tool.imageAlt,
  };
  return {
    title: tool.title,
    description: tool.metaDescription,
    keywords: tool.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: tool.h1,
      description: tool.metaDescription,
      type: 'website',
      url,
      siteName: siteConfig.brand,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: tool.h1,
      description: tool.metaDescription,
      images: [imageUrl],
    },
    robots: { index: true, follow: true },
  };
}

export function requireTool(slug: string) {
  const tool = getTool(slug);
  if (!tool) {
    throw new Error(`requireTool: unknown tool slug "${slug}"`);
  }
  return tool;
}
