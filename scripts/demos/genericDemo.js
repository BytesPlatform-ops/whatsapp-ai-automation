// Demo business data for the generic business-starter template — Portland
// specialty coffee shop. No niche match → falls through to the generic
// renderer with services + hero + about + contact pages.

module.exports = {
  id: 'generic',
  label: 'Coffee Shop',
  prompt:
    'I own a specialty coffee shop in Portland. I want a clean site with our drinks, wholesale beans, and contact info.',
  businessData: {
    businessName: 'Byte Coffee Co.',
    industry: 'Specialty coffee shop',
    services: [
      'Espresso Bar',
      'Pour-over & Drip',
      'Cold Brew',
      'Pastries & Toast',
      'Wholesale Beans',
      'Coffee Subscriptions',
    ],
    contactEmail: 'hello@bytecoffee.co',
    contactPhone: '+1 (503) 555-2983',
    contactAddress: '1802 NW 23rd Ave, Portland, OR 97210',
    // Warm neutral palette — deep espresso + caramel accent
    primaryColor: '#1C1917',
    secondaryColor: '#0C0A09',
    accentColor: '#D97706',
    // Pinned hero — specialty coffee. Skips Unsplash API.
    heroImage: {
      url: 'https://images.unsplash.com/photo-1453614512568-c4024d13c247?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80',
      photographer: 'Unsplash',
      photographerUrl: 'https://unsplash.com/?utm_source=bytes_platform&utm_medium=referral',
      unsplashUrl: 'https://unsplash.com/?utm_source=bytes_platform&utm_medium=referral',
    },
  },
};
