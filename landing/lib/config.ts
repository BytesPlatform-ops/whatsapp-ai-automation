// Central config — swap these to rebrand or point at a different bot.
export const siteConfig = {
  brand: 'Pixie',
  tagline: 'Your website & marketing ads — built by a WhatsApp chat.',
  whatsappNumber: '3197010277911',
  supportEmail: 'hello@pixiebot.co',
  domain: 'pixiebot.co',
} as const;

export function waLink(prefill?: string): string {
  const base = `https://wa.me/${siteConfig.whatsappNumber}`;
  if (!prefill) return base;
  return `${base}?text=${encodeURIComponent(prefill)}`;
}
