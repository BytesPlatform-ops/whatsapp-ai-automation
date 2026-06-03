'use strict';

// Country dial codes for the contact-phone picker on the FINISH screen.
// id = dial code (used as-is when composing the stored phone), title shown
// in the Dropdown. Ordered most-likely-first (current markets) then broadly
// alphabetical. WhatsApp Dropdown supports up to 200 items.

const COUNTRY_CODES = [
  { id: '+1', title: '🇺🇸 United States / Canada (+1)' },
  { id: '+44', title: '🇬🇧 United Kingdom (+44)' },
  { id: '+55', title: '🇧🇷 Brazil (+55)' },
  { id: '+92', title: '🇵🇰 Pakistan (+92)' },
  { id: '+91', title: '🇮🇳 India (+91)' },
  { id: '+971', title: '🇦🇪 UAE (+971)' },
  { id: '+353', title: '🇮🇪 Ireland (+353)' },
  { id: '+61', title: '🇦🇺 Australia (+61)' },
  { id: '+33', title: '🇫🇷 France (+33)' },
  { id: '+49', title: '🇩🇪 Germany (+49)' },
  { id: '+34', title: '🇪🇸 Spain (+34)' },
  { id: '+39', title: '🇮🇹 Italy (+39)' },
  { id: '+351', title: '🇵🇹 Portugal (+351)' },
  { id: '+31', title: '🇳🇱 Netherlands (+31)' },
  { id: '+52', title: '🇲🇽 Mexico (+52)' },
  { id: '+966', title: '🇸🇦 Saudi Arabia (+966)' },
  { id: '+27', title: '🇿🇦 South Africa (+27)' },
  { id: '+234', title: '🇳🇬 Nigeria (+234)' },
  { id: '+20', title: '🇪🇬 Egypt (+20)' },
  { id: '+880', title: '🇧🇩 Bangladesh (+880)' },
  // Broad alphabetical coverage
  { id: '+93', title: '🇦🇫 Afghanistan (+93)' },
  { id: '+355', title: '🇦🇱 Albania (+355)' },
  { id: '+213', title: '🇩🇿 Algeria (+213)' },
  { id: '+54', title: '🇦🇷 Argentina (+54)' },
  { id: '+374', title: '🇦🇲 Armenia (+374)' },
  { id: '+43', title: '🇦🇹 Austria (+43)' },
  { id: '+994', title: '🇦🇿 Azerbaijan (+994)' },
  { id: '+973', title: '🇧🇭 Bahrain (+973)' },
  { id: '+32', title: '🇧🇪 Belgium (+32)' },
  { id: '+591', title: '🇧🇴 Bolivia (+591)' },
  { id: '+359', title: '🇧🇬 Bulgaria (+359)' },
  { id: '+855', title: '🇰🇭 Cambodia (+855)' },
  { id: '+237', title: '🇨🇲 Cameroon (+237)' },
  { id: '+56', title: '🇨🇱 Chile (+56)' },
  { id: '+86', title: '🇨🇳 China (+86)' },
  { id: '+57', title: '🇨🇴 Colombia (+57)' },
  { id: '+506', title: '🇨🇷 Costa Rica (+506)' },
  { id: '+385', title: '🇭🇷 Croatia (+385)' },
  { id: '+357', title: '🇨🇾 Cyprus (+357)' },
  { id: '+420', title: '🇨🇿 Czechia (+420)' },
  { id: '+45', title: '🇩🇰 Denmark (+45)' },
  { id: '+593', title: '🇪🇨 Ecuador (+593)' },
  { id: '+503', title: '🇸🇻 El Salvador (+503)' },
  { id: '+372', title: '🇪🇪 Estonia (+372)' },
  { id: '+251', title: '🇪🇹 Ethiopia (+251)' },
  { id: '+358', title: '🇫🇮 Finland (+358)' },
  { id: '+995', title: '🇬🇪 Georgia (+995)' },
  { id: '+233', title: '🇬🇭 Ghana (+233)' },
  { id: '+30', title: '🇬🇷 Greece (+30)' },
  { id: '+502', title: '🇬🇹 Guatemala (+502)' },
  { id: '+504', title: '🇭🇳 Honduras (+504)' },
  { id: '+852', title: '🇭🇰 Hong Kong (+852)' },
  { id: '+36', title: '🇭🇺 Hungary (+36)' },
  { id: '+62', title: '🇮🇩 Indonesia (+62)' },
  { id: '+98', title: '🇮🇷 Iran (+98)' },
  { id: '+964', title: '🇮🇶 Iraq (+964)' },
  { id: '+972', title: '🇮🇱 Israel (+972)' },
  { id: '+81', title: '🇯🇵 Japan (+81)' },
  { id: '+962', title: '🇯🇴 Jordan (+962)' },
  { id: '+7', title: '🇰🇿 Kazakhstan / Russia (+7)' },
  { id: '+254', title: '🇰🇪 Kenya (+254)' },
  { id: '+965', title: '🇰🇼 Kuwait (+965)' },
  { id: '+856', title: '🇱🇦 Laos (+856)' },
  { id: '+371', title: '🇱🇻 Latvia (+371)' },
  { id: '+961', title: '🇱🇧 Lebanon (+961)' },
  { id: '+370', title: '🇱🇹 Lithuania (+370)' },
  { id: '+352', title: '🇱🇺 Luxembourg (+352)' },
  { id: '+60', title: '🇲🇾 Malaysia (+60)' },
  { id: '+960', title: '🇲🇻 Maldives (+960)' },
  { id: '+356', title: '🇲🇹 Malta (+356)' },
  { id: '+212', title: '🇲🇦 Morocco (+212)' },
  { id: '+95', title: '🇲🇲 Myanmar (+95)' },
  { id: '+977', title: '🇳🇵 Nepal (+977)' },
  { id: '+64', title: '🇳🇿 New Zealand (+64)' },
  { id: '+505', title: '🇳🇮 Nicaragua (+505)' },
  { id: '+47', title: '🇳🇴 Norway (+47)' },
  { id: '+968', title: '🇴🇲 Oman (+968)' },
  { id: '+507', title: '🇵🇦 Panama (+507)' },
  { id: '+595', title: '🇵🇾 Paraguay (+595)' },
  { id: '+51', title: '🇵🇪 Peru (+51)' },
  { id: '+63', title: '🇵🇭 Philippines (+63)' },
  { id: '+48', title: '🇵🇱 Poland (+48)' },
  { id: '+974', title: '🇶🇦 Qatar (+974)' },
  { id: '+40', title: '🇷🇴 Romania (+40)' },
  { id: '+250', title: '🇷🇼 Rwanda (+250)' },
  { id: '+221', title: '🇸🇳 Senegal (+221)' },
  { id: '+381', title: '🇷🇸 Serbia (+381)' },
  { id: '+65', title: '🇸🇬 Singapore (+65)' },
  { id: '+421', title: '🇸🇰 Slovakia (+421)' },
  { id: '+386', title: '🇸🇮 Slovenia (+386)' },
  { id: '+82', title: '🇰🇷 South Korea (+82)' },
  { id: '+94', title: '🇱🇰 Sri Lanka (+94)' },
  { id: '+46', title: '🇸🇪 Sweden (+46)' },
  { id: '+41', title: '🇨🇭 Switzerland (+41)' },
  { id: '+886', title: '🇹🇼 Taiwan (+886)' },
  { id: '+255', title: '🇹🇿 Tanzania (+255)' },
  { id: '+66', title: '🇹🇭 Thailand (+66)' },
  { id: '+216', title: '🇹🇳 Tunisia (+216)' },
  { id: '+90', title: '🇹🇷 Turkey (+90)' },
  { id: '+256', title: '🇺🇬 Uganda (+256)' },
  { id: '+380', title: '🇺🇦 Ukraine (+380)' },
  { id: '+598', title: '🇺🇾 Uruguay (+598)' },
  { id: '+998', title: '🇺🇿 Uzbekistan (+998)' },
  { id: '+58', title: '🇻🇪 Venezuela (+58)' },
  { id: '+84', title: '🇻🇳 Vietnam (+84)' },
  { id: '+967', title: '🇾🇪 Yemen (+967)' },
  { id: '+260', title: '🇿🇲 Zambia (+260)' },
  { id: '+263', title: '🇿🇼 Zimbabwe (+263)' },
];

// Acceptable national-number digit counts (the "national significant number"
// — i.e. WITHOUT the country code and WITHOUT a leading trunk 0) per dial
// code. Used to sanity-check the phone the user types on the FINISH screen
// against the country code they picked, so e.g. a UAE (+971) number must be
// the 8–9 digits a real UAE number has. Sets are deliberately GENEROUS
// (mobile + landline lengths) to avoid rejecting valid numbers — the phone
// field is optional, so a false reject would needlessly block a lead. Dial
// codes absent from this map fall back to a generic E.164 length check.
const NATIONAL_LENGTHS = {
  '+1': [10], '+44': [9, 10], '+55': [10, 11], '+92': [10], '+91': [10],
  '+971': [8, 9], '+353': [7, 8, 9], '+61': [9], '+33': [9],
  '+49': [6, 7, 8, 9, 10, 11], '+34': [9], '+39': [9, 10, 11], '+351': [9],
  '+31': [9], '+52': [10], '+966': [9], '+27': [9], '+234': [8, 10],
  '+20': [9, 10], '+880': [10], '+93': [9], '+355': [9], '+213': [9],
  '+54': [10, 11], '+374': [8], '+43': [7, 8, 9, 10, 11, 12, 13], '+994': [9],
  '+973': [8], '+32': [8, 9], '+591': [8], '+359': [8, 9], '+855': [8, 9],
  '+237': [9], '+56': [9], '+86': [11], '+57': [10], '+506': [8],
  '+385': [8, 9], '+357': [8], '+420': [9], '+45': [8], '+593': [8, 9],
  '+503': [8], '+372': [7, 8], '+251': [9], '+358': [9, 10], '+995': [9],
  '+233': [9], '+30': [10], '+502': [8], '+504': [8], '+852': [8], '+36': [9],
  '+62': [9, 10, 11, 12], '+98': [10], '+964': [10], '+972': [9], '+81': [10],
  '+962': [9], '+7': [10], '+254': [9], '+965': [8], '+856': [8, 9, 10],
  '+371': [8], '+961': [7, 8], '+370': [8], '+352': [6, 7, 8, 9], '+60': [9, 10],
  '+960': [7], '+356': [8], '+212': [9], '+95': [8, 9, 10], '+977': [10],
  '+64': [8, 9, 10], '+505': [8], '+47': [8], '+968': [8], '+507': [8],
  '+595': [9], '+51': [9], '+63': [10], '+48': [9], '+974': [8], '+40': [9],
  '+250': [9], '+221': [9], '+381': [8, 9], '+65': [8], '+421': [9], '+386': [8],
  '+82': [9, 10], '+94': [9], '+46': [7, 8, 9], '+41': [9], '+886': [9],
  '+255': [9], '+66': [9], '+216': [8], '+90': [10], '+256': [9], '+380': [9],
  '+598': [8], '+998': [9], '+58': [10], '+84': [9, 10], '+967': [9], '+260': [9],
  '+263': [9],
};

// Reduce a user-typed phone to its national significant digits, given the
// dial code they picked: strips non-digits, drops a re-typed leading country
// code, then drops a single trunk 0 — mirroring how intake.js composes the
// stored number.
function nationalDigits(dialCode, raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  const cc = String(dialCode || '').replace(/\D/g, '');
  if (cc && digits.length > cc.length && digits.startsWith(cc)) {
    digits = digits.slice(cc.length);
  }
  return digits.replace(/^0+/, '');
}

/**
 * Validate a typed phone number against the chosen country's dial code by
 * digit count. Empty input is treated as valid (the field is optional — the
 * caller decides whether to require it).
 *
 * @returns {{ valid: boolean, empty: boolean, expected: number[]|null, length: number }}
 */
function validatePhoneForCode(dialCode, raw) {
  const nd = nationalDigits(dialCode, raw);
  const cc = String(dialCode || '').replace(/\D/g, '');
  const expected = NATIONAL_LENGTHS[`+${cc}`] || null;
  if (!nd) return { valid: true, empty: true, expected, length: 0 };
  const total = cc.length + nd.length;
  // Hard E.164 sanity first (≤15 total digits; a real subscriber number is
  // at least 4 nationally). Then the per-country length set when we have one.
  if (nd.length < 4 || total > 15) return { valid: false, empty: false, expected, length: nd.length };
  if (expected && !expected.includes(nd.length)) {
    return { valid: false, empty: false, expected, length: nd.length };
  }
  return { valid: true, empty: false, expected, length: nd.length };
}

module.exports = { COUNTRY_CODES, NATIONAL_LENGTHS, nationalDigits, validatePhoneForCode };
