import { TOOLS } from '@/lib/tools';
import { siteConfig } from '@/lib/config';

export const dynamic = 'force-static';

interface SitemapUrl {
  loc: string;
  lastmod: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: string;
}

export async function GET() {
  const baseUrl = `https://${siteConfig.domain}`;
  const lastmod = new Date().toISOString();

  const urls: SitemapUrl[] = [
    { loc: `${baseUrl}/`, lastmod, changefreq: 'daily', priority: '1.0' },
    { loc: `${baseUrl}/examples`, lastmod, changefreq: 'weekly', priority: '0.8' },
    { loc: `${baseUrl}/tools`, lastmod, changefreq: 'daily', priority: '1.0' },
    { loc: `${baseUrl}/privacy`, lastmod, changefreq: 'monthly', priority: '0.3' },
    ...TOOLS.map((t) => ({
      loc: `${baseUrl}/tools/${t.slug}`,
      lastmod,
      changefreq: 'daily' as const,
      priority: '1.0',
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
