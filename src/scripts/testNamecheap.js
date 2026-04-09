/**
 * Test Namecheap Sandbox API integration.
 *
 * Usage:
 *   node src/scripts/testNamecheap.js check mybusiness
 *   node src/scripts/testNamecheap.js register mybusiness.com
 *   node src/scripts/testNamecheap.js dns mybusiness.com preview-12345
 *   node src/scripts/testNamecheap.js full mybusiness.com preview-12345
 */

require('dotenv').config();
const { checkDomainAvailability, checkDomains, registerDomain, setDNSForNetlify, purchaseAndConfigureDomain } = require('../integrations/namecheap');

const [,, command, arg1, arg2] = process.argv;

async function run() {
  if (!process.env.NAMECHEAP_API_KEY) {
    console.error('Missing NAMECHEAP_API_KEY in .env');
    process.exit(1);
  }

  console.log(`Sandbox mode: ${process.env.NAMECHEAP_USE_SANDBOX === 'true' ? 'YES' : 'NO'}\n`);

  switch (command) {
    case 'check': {
      if (!arg1) { console.error('Usage: testNamecheap.js check <baseName>'); return; }
      console.log(`Checking availability for: ${arg1}\n`);
      const results = await checkDomainAvailability(arg1);
      results.forEach(r => {
        const status = r.premium ? '⚠️ PREMIUM' : r.available ? '✅ AVAILABLE' : '❌ TAKEN';
        console.log(`  ${status}  ${r.domain}${r.price ? ` ($${r.price})` : ''}`);
      });
      break;
    }

    case 'register': {
      if (!arg1) { console.error('Usage: testNamecheap.js register <domain.com>'); return; }
      console.log(`Registering: ${arg1}\n`);
      const result = await registerDomain(arg1);
      console.log('Result:', JSON.stringify(result, null, 2));
      break;
    }

    case 'dns': {
      if (!arg1 || !arg2) { console.error('Usage: testNamecheap.js dns <domain.com> <netlify-subdomain>'); return; }
      console.log(`Setting DNS for ${arg1} → ${arg2}.netlify.app\n`);
      const success = await setDNSForNetlify(arg1, arg2);
      console.log('Success:', success);
      break;
    }

    case 'full': {
      if (!arg1 || !arg2) { console.error('Usage: testNamecheap.js full <domain.com> <netlify-subdomain>'); return; }
      console.log(`Full flow: check → register → DNS for ${arg1}\n`);
      const result = await purchaseAndConfigureDomain(arg1, arg2);
      console.log('Result:', JSON.stringify(result, null, 2));
      break;
    }

    default:
      console.log('Commands:');
      console.log('  check <baseName>              — Check domain availability');
      console.log('  register <domain.com>         — Register a domain');
      console.log('  dns <domain.com> <subdomain>  — Set DNS records for Netlify');
      console.log('  full <domain.com> <subdomain> — Full flow: check + register + DNS');
  }
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
