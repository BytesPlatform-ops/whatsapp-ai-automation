// Demo business data for the Salon template — Miami Beach hair salon with
// native booking. templateId='salon' tells the generator/deployer to use
// the salon renderer with booking flow.

module.exports = {
  id: 'salon',
  label: 'Salon',
  templateId: 'salon',
  prompt:
    'I run a hair salon in Miami Beach. I need a website with online booking, an Instagram feed, and pricing for cuts and color.',
  businessData: {
    businessName: 'Luna Beauty Studio',
    industry: 'Hair Salon',
    services: [
      'Haircut',
      'Color & Highlights',
      'Balayage',
      'Keratin Treatment',
      'Blowout',
      'Bridal Styling',
    ],
    salonServices: [
      { name: 'Signature Haircut', durationMinutes: 60, price: 75 },
      { name: 'Color & Highlights', durationMinutes: 150, price: 185 },
      { name: 'Balayage', durationMinutes: 180, price: 240 },
      { name: 'Keratin Treatment', durationMinutes: 120, price: 195 },
      { name: 'Blowout', durationMinutes: 45, price: 55 },
      { name: 'Bridal Styling', durationMinutes: 90, price: 150 },
    ],
    bookingMode: 'native',
    instagramHandle: 'lunabeautystudio',
    // Each day is an array of open/close slots so the salon template can
    // render split shifts if needed. Empty array = closed.
    weeklyHours: {
      mon: [],
      tue: [{ open: '09:00', close: '19:00' }],
      wed: [{ open: '09:00', close: '19:00' }],
      thu: [{ open: '09:00', close: '20:00' }],
      fri: [{ open: '09:00', close: '20:00' }],
      sat: [{ open: '09:00', close: '18:00' }],
      sun: [{ open: '10:00', close: '17:00' }],
    },
    timezone: 'America/New_York',
    contactEmail: 'hello@lunabeautystudio.com',
    contactPhone: '+1 (305) 555-5862',
    contactAddress: '1243 Collins Ave, Miami Beach, FL 33139',
    // Salon palette — deep plum + rose gold accent
    primaryColor: '#1F2937',
    secondaryColor: '#111827',
    accentColor: '#EC4899',
    // Pinned hero — minimalist hair salon. Skips Unsplash API.
    heroImage: {
      url: 'https://images.unsplash.com/photo-1600948836101-f9ffda59d250?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80',
      photographer: 'Greg Trowman',
      photographerUrl: 'https://unsplash.com/?utm_source=bytes_platform&utm_medium=referral',
      unsplashUrl: 'https://unsplash.com/?utm_source=bytes_platform&utm_medium=referral',
    },
  },
};
