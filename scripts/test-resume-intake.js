#!/usr/bin/env node
'use strict';

// Offline-ish test for the resume → portfolio pipeline. Builds resume PDFs
// in-memory (pdfkit), runs the REAL extract path (pdf-parse + the LLM
// extractor) and the pure websiteData mapper. No Meta / Supabase / deploy —
// downloadMedia + generateWebsite are not exercised here.
//
// Run:  node -r dotenv/config scripts/test-resume-intake.js   (hits OpenAI, ~$0.01)

const PDFDocument = require('pdfkit');
const {
  extractResumeText, extractResumeStructure, buildWebsiteDataFromResume,
} = require('../src/website-gen/resumeIntake');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

// Render an array of lines into a PDF buffer.
function makePdf(lines) {
  return new Promise((resolve) => {
    const doc = new PDFDocument();
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    lines.forEach((l, i) => doc.fontSize(i === 0 ? 18 : 11).text(l));
    doc.end();
  });
}

const DEV_RESUME = [
  'Jane Doe',
  'Senior Backend Developer — 6 years of experience',
  'Email: jane@doe.dev  Phone: +1 555 234 1122',
  'Links: github.com/janedoe  linkedin.com/in/janedoe',
  'Summary: Backend engineer specialising in distributed systems and developer tooling.',
  'Skills: Node.js, TypeScript, PostgreSQL, Docker, AWS, gRPC',
  'Experience:',
  'Acme Corp — Senior Engineer (2021–2024). Built a multi-region request router used in production.',
  'Projects:',
  'pixie-replay — Behavioral test runner for an LLM state machine. Node, Supabase. 2025.',
  'cloud-router — Regional egress router for a CDN. Go, gRPC. 2024.',
  'Currently building an AI-driven deploy assistant.',
];

const INVOICE = [
  'INVOICE #4821',
  'Bill to: Acme Corp, 5 Main St',
  'Item: Consulting services — 10 hours @ $150 = $1500',
  'Total due: $1500. Payment terms: net 30.',
];

(async () => {
  console.log('\n=== 1. Developer resume → text ===');
  const devPdf = await makePdf(DEV_RESUME);
  const text = await extractResumeText(devPdf);
  ok('text extracted', text.length > 100);
  ok('text has name + skills', /Jane Doe/.test(text) && /Node\.js/.test(text));
  ok('page markers stripped', !/--\s*1 of 1\s*--/.test(text));

  console.log('\n=== 2. Developer resume → structure (LLM) ===');
  const s = await extractResumeStructure(text, '00000000-0000-0000-0000-000000000000');
  ok('isResume true', s && s.isResume === true);
  ok('niche = developer', s && s.niche === 'developer');
  ok('has skills', s && Array.isArray(s.skills) && s.skills.length >= 3);
  ok('has projects', s && Array.isArray(s.projects) && s.projects.length >= 1);
  ok('links captured', s && /github/i.test(String(s.links || '')));

  console.log('\n=== 3. structure → websiteData ===');
  const wd = buildWebsiteDataFromResume(s || {});
  ok('industryKey portfolio', wd.industryKey === 'portfolio');
  ok('portfolioNiche developer', wd.portfolioNiche === 'developer');
  ok('businessName set', !!wd.businessName);
  ok('services (skills) populated', Array.isArray(wd.services) && wd.services.length >= 3);
  ok('githubHandle parsed', wd.githubHandle === 'janedoe');
  ok('projects mapped w/ photoUrl null', Array.isArray(wd.projects) && wd.projects.length >= 1 && wd.projects[0].photoUrl === null);
  ok('yearsExperience parsed', wd.yearsExperience === 6);
  ok('contactEmail parsed', /jane@doe\.dev/.test(wd.contactEmail || ''));
  ok('done-flags set', wd.portfolioSkillsDone === true && wd.projectsFlowDone === true);

  console.log('\n=== 4. Non-resume (invoice) → isResume false ===');
  const invPdf = await makePdf(INVOICE);
  const invText = await extractResumeText(invPdf);
  const invS = await extractResumeStructure(invText, '00000000-0000-0000-0000-000000000000');
  ok('invoice → isResume false', invS && invS.isResume === false);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('Harness crashed:', e); process.exit(1); });
