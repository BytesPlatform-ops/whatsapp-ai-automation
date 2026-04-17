// Demo business data for the HVAC template — realistic Austin, TX company
// used to populate the "Examples" page on pixiebot.co. Matches the shape
// expected by generateWebsiteContent().

module.exports = {
  id: 'hvac',
  label: 'HVAC',
  prompt:
    'I need a website for my HVAC company in Austin. We do AC repair, heating, duct cleaning, and emergency service.',
  businessData: {
    businessName: 'Austin Climate Pros',
    industry: 'HVAC',
    primaryCity: 'Austin, TX',
    serviceAreas: ['Round Rock', 'Cedar Park', 'Pflugerville', 'Leander', 'Georgetown'],
    services: [
      'AC Repair',
      'AC Installation',
      'Heating Repair',
      'Heat Pumps',
      'Duct Cleaning',
      'Thermostats',
      'Emergency Service',
    ],
    yearsExperience: 15,
    licenseNumber: 'TACLA012345C',
    googleRating: 4.9,
    reviewCount: 247,
    contactEmail: 'service@austinclimatepros.com',
    contactPhone: '+1 (512) 555-2665',
    contactAddress: '2104 E 6th St, Austin, TX 78702',
    // HVAC palette — trust blue + orange (matches what the bot assigns)
    primaryColor: '#1E3A5F',
    secondaryColor: '#0F172A',
    accentColor: '#F97316',
    // Pinned hero image — skips Unsplash API (rate-limited on demo account).
    heroImage: {
      url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80',
      photographer: 'Unsplash',
      photographerUrl: 'https://unsplash.com/?utm_source=bytes_platform&utm_medium=referral',
      unsplashUrl: 'https://unsplash.com/?utm_source=bytes_platform&utm_medium=referral',
    },
  },
};
