import type { ToolDefinition } from '@/lib/tools';
import { siteConfig } from '@/lib/config';

interface ToolJsonLdProps {
  tool: ToolDefinition;
}

export function ToolJsonLd({ tool }: ToolJsonLdProps) {
  const baseUrl = `https://${siteConfig.domain}`;
  const toolUrl = `${baseUrl}/tools/${tool.slug}`;

  const softwareApplication = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: tool.shortName,
    description: tool.metaDescription,
    url: toolUrl,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    creator: {
      '@type': 'Organization',
      name: siteConfig.brand,
      url: baseUrl,
    },
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: baseUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Free Tools',
        item: `${baseUrl}/tools`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: tool.shortName,
        item: toolUrl,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplication) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
    </>
  );
}
