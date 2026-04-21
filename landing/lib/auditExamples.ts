// AUTO-POPULATED by scripts/generateAuditExamples (or regenerated manually
// by running the audit script against smaller sites and copying the output
// JSON here). PDFs live in landing/public/audits/*.pdf so they're served
// by Vercel at pixiebot.co/audits/<id>.pdf.

export interface AuditExample {
  id: string;
  url: string;
  label: string;           // category tag (e.g. "Scheduling SaaS")
  score: number;           // 0-100 overall score from the Pixie scorer
  verdict: string;         // short 1-line narrative from the audit
  lighthouse: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  };
  topRec: string;          // outcome-framed top recommendation (4-10 words)
  criticalMisses: number;  // count of missing canonical / robots / sitemap / schema
  pdfPath: string;         // relative URL — served by Vercel static
}

export const AUDIT_EXAMPLES: AuditExample[] = [
  {
    id: 'plausible',
    url: 'https://plausible.io',
    label: 'Analytics startup',
    score: 86,
    verdict: "Your website's security issues are severely risking customer trust.",
    lighthouse: { performance: 98, accessibility: 64, bestPractices: 100, seo: 92 },
    topRec: 'Earn customer trust before they order',
    criticalMisses: 0,
    pdfPath: '/audits/plausible.pdf',
  },
  {
    id: 'sivers',
    url: 'https://sivers.org',
    label: 'Personal blog',
    score: 82,
    verdict: "Critical technical issues are hindering your website's performance and visibility.",
    lighthouse: { performance: 94, accessibility: 94, bestPractices: 96, seo: 100 },
    topRec: 'Improve customer trust and user experience',
    criticalMisses: 2,
    pdfPath: '/audits/sivers.pdf',
  },
  {
    id: 'buttondown',
    url: 'https://buttondown.email',
    label: 'Newsletter platform',
    score: 79,
    verdict: "Your website's slow load times and security issues are losing customers.",
    lighthouse: { performance: 78, accessibility: 94, bestPractices: 96, seo: 100 },
    topRec: 'Increase customer retention with faster load times',
    criticalMisses: 1,
    pdfPath: '/audits/buttondown.pdf',
  },
  {
    id: 'cal',
    url: 'https://cal.com',
    label: 'Scheduling SaaS',
    score: 72,
    verdict: 'Your site is losing customers due to slow loading times and missing content optimization.',
    lighthouse: { performance: 58, accessibility: 90, bestPractices: 96, seo: 100 },
    topRec: 'Boost customer satisfaction with faster loading times',
    criticalMisses: 1,
    pdfPath: '/audits/cal.pdf',
  },
];

/** Map a 0-100 score to the same verdict tier the PDF uses — kept in sync so
 *  the card's chip matches the chip on the rendered report. */
export function scoreVerdict(score: number): { label: string; className: string } {
  if (score >= 85) return { label: 'Excellent', className: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/30' };
  if (score >= 75) return { label: 'Good', className: 'text-wa-teal bg-wa-teal/15 ring-wa-teal/30' };
  if (score >= 60) return { label: 'Needs Attention', className: 'text-amber-400 bg-amber-500/10 ring-amber-500/30' };
  if (score >= 45) return { label: 'Poor', className: 'text-orange-400 bg-orange-500/10 ring-orange-500/30' };
  return { label: 'Critical', className: 'text-red-400 bg-red-500/10 ring-red-500/30' };
}
