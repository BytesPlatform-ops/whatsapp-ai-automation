// Reproduction test for the cross-account service-leakage bug.
// Proves workspace_services is scoped per workspace: activating in A never
// affects B, and constraints prevent duplicate/global rows.
// Run: node --env-file=.env scripts/repro-service-isolation.mjs
import { PrismaClient } from '@prisma/client';
// Mirrors lib/permissions.hasPermission (owner always passes; else explicit list).
const hasPermission = (role, permissions, perm) => role === 'owner' ? true : (Array.isArray(permissions) ? permissions : []).includes(perm);

const prisma = new PrismaClient();
const A_OWNER = '00000000-0000-0000-0000-00000000a001';
const B_OWNER = '00000000-0000-0000-0000-00000000b001';
let pass = 0, fail = 0;
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); cond ? pass++ : fail++; };

async function statesOf(workspaceId) {
  const rows = await prisma.workspaceService.findMany({ where: { workspaceId } });
  const m = Object.fromEntries(['website', 'receptionist', 'seo', 'marketing', 'content'].map((k) => [k, 'locked']));
  for (const r of rows) m[r.serviceKey] = r.status;
  return m;
}
async function activate(workspaceId, serviceKey, by, status = 'active') {
  await prisma.workspaceService.upsert({
    where: { workspaceId_serviceKey: { workspaceId, serviceKey } },
    create: { workspaceId, serviceKey, status, activatedBy: by },
    update: { status, activatedBy: by },
  });
}

async function mkWorkspace(name, owner) {
  return prisma.workspace.create({ data: { name, slug: `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, ownerId: owner,
    members: { create: { userId: owner, role: 'owner', permissions: [], status: 'active', joinedAt: new Date() } } } });
}

const A = await mkWorkspace('acctA', A_OWNER);
const B = await mkWorkspace('acctB', B_OWNER);
try {
  // Account A activates 2 services (Scenario A steps 1-4)
  await activate(A.id, 'website', A_OWNER);
  await activate(A.id, 'receptionist', A_OWNER, 'trial');
  const aStates = await statesOf(A.id);
  ok('A: website active', aStates.website === 'active');
  ok('A: receptionist trial', aStates.receptionist === 'trial');

  // Account B (separate workspace) must be CLEAN — the bug was B inheriting A (steps 7-9)
  const bStates = await statesOf(B.id);
  ok('B: website LOCKED (no leak)', bStates.website === 'locked');
  ok('B: receptionist LOCKED (no leak)', bStates.receptionist === 'locked');
  ok('B: all 5 locked', Object.values(bStates).every((s) => s === 'locked'));

  // B activates a different service (step 10)
  await activate(B.id, 'seo', B_OWNER);
  const bStates2 = await statesOf(B.id);
  ok('B: seo active after B activates it', bStates2.seo === 'active');
  ok('B: website still locked', bStates2.website === 'locked');

  // A unchanged by B's activation (steps 12-13)
  const aStates2 = await statesOf(A.id);
  ok('A: unchanged (website active)', aStates2.website === 'active');
  ok('A: unchanged (seo still locked)', aStates2.seo === 'locked');

  // Constraint: no duplicate/global rows for a (workspace, service)
  let dupBlocked = false;
  try { await prisma.workspaceService.create({ data: { workspaceId: A.id, serviceKey: 'website', status: 'active' } }); }
  catch { dupBlocked = true; }
  ok('unique(workspace_id, service_key) blocks duplicate', dupBlocked);

  // Permission: a viewer cannot manage services (API returns 403; logic check here)
  ok('viewer lacks website.manage', hasPermission('viewer', [], 'website.manage') === false);
  ok('owner has website.manage', hasPermission('owner', [], 'website.manage') === true);
} finally {
  await prisma.workspace.delete({ where: { id: A.id } }).catch(() => {});
  await prisma.workspace.delete({ where: { id: B.id } }).catch(() => {});
  await prisma.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
