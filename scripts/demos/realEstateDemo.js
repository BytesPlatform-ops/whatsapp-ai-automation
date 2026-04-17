// Demo business data for the Real Estate template — Austin, TX luxury agent.

module.exports = {
  id: 'real-estate',
  label: 'Real Estate',
  prompt:
    "I'm a realtor in Austin. I work with luxury buyers and first-time homeowners across Westlake, Circle C, and Barton Hills.",
  businessData: {
    businessName: 'Sarah Mitchell',
    industry: 'Real Estate',
    primaryCity: 'Austin, TX',
    serviceAreas: [
      'Westlake',
      'Circle C Ranch',
      'Barton Hills',
      'Tarrytown',
      'Mueller',
      'Zilker',
    ],
    brokerageName: 'Sterling Realty Group',
    yearsExperience: 12,
    designations: ['CRS', 'ABR', 'SRS'],
    specialty: 'Luxury homes & first-time buyers',
    homesSold: '240+',
    volumeClosed: '$185M+',
    licenseNumber: 'TX 0742318',
    contactEmail: 'sarah@sterlingrealty.com',
    contactPhone: '+1 (512) 555-7462',
    contactAddress: '3410 Bee Cave Rd, Austin, TX 78746',
    // Real-estate palette — deep navy + champagne gold
    primaryColor: '#1A2B45',
    secondaryColor: '#0F1B30',
    accentColor: '#C9A96E',
    // User-provided listings (overrides LLM hallucination). Realistic
    // Austin addresses with market-accurate pricing.
    listings: [
      {
        address: '1847 Barton Hills Dr',
        price: 1650000,
        beds: 4,
        baths: 3.5,
        sqft: 3200,
        status: 'For Sale',
        neighborhood: 'Barton Hills',
        photoUrl: null,
      },
      {
        address: '4212 Westlake Dr',
        price: 2495000,
        beds: 5,
        baths: 4.5,
        sqft: 4800,
        status: 'Just Listed',
        neighborhood: 'Westlake',
        photoUrl: null,
      },
      {
        address: '6708 Circle C Pkwy',
        price: 895000,
        beds: 4,
        baths: 3,
        sqft: 2850,
        status: 'Pending',
        neighborhood: 'Circle C Ranch',
        photoUrl: null,
      },
    ],
    agentProfileCollected: true,
    listingsAskAnswered: true,
    listingsDetailsDone: true,
    listingsFlowDone: true,
    // Pinned hero — Austin TX skyline. Skips Unsplash API.
    heroImage: {
      url: 'https://images.unsplash.com/photo-1650638952928-da7470403d86?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80',
      photographer: 'Mitchell Kmetz',
      photographerUrl: 'https://unsplash.com/?utm_source=bytes_platform&utm_medium=referral',
      unsplashUrl: 'https://unsplash.com/?utm_source=bytes_platform&utm_medium=referral',
    },
  },
};
