// Central config — swap these to rebrand or point at a different bot.
export const siteConfig = {
  brand: 'BytesPlatform',
  tagline: 'Your website & marketing ads — built by a WhatsApp chat.',
  whatsappNumber: '3197010277911',
  supportEmail: 'hello@bytesplatform.com',
  domain: 'bytesplatform.com',
} as const;

export function waLink(prefill?: string): string {
  const base = `https://wa.me/${siteConfig.whatsappNumber}`;
  if (!prefill) return base;
  return `${base}?text=${encodeURIComponent(prefill)}`;
}
