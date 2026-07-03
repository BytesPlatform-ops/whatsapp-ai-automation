import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /api/profile — the signed-in user's own profile (profiles table via Prisma).
 * GET  → returns the profile, seeding a row from auth metadata on first read.
 * PATCH→ updates editable fields for the current user ONLY, and mirrors the
 *        display name into Supabase auth metadata so the dashboard greeting
 *        stays in sync. A user can never read/write another user's profile.
 */

function clip(v: unknown, max = 160): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

/**
 * Concurrency-safe profile upsert. Prisma's upsert is a non-atomic
 * find-then-create, so two first-load requests for the same user can both miss
 * the row and race to create it — the loser throws P2002 on `id`. When that
 * happens the row now exists, so we fall back to a plain update. Returns the
 * profile either way.
 */
async function upsertProfile(
  where: Prisma.ProfileWhereUniqueInput,
  create: Prisma.ProfileCreateInput,
  update: Prisma.ProfileUpdateInput,
) {
  try {
    return await prisma.profile.upsert({ where, create, update });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return prisma.profile.update({ where, data: update });
    }
    throw e;
  }
}

async function currentUser() {
  try {
    const { data } = await createClient().auth.getUser();
    return data.user;
  } catch {
    return null;
  }
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const seedName = (typeof meta.full_name === 'string' && meta.full_name) || (typeof meta.name === 'string' && meta.name) || null;

  const profile = await upsertProfile(
    { id: user.id },
    { id: user.id, email: user.email ?? `${user.id}@no-email.local`, fullName: seedName },
    {},
  );
  return NextResponse.json({ profile });
}

export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* empty */ }

  const fields = {
    fullName: clip(body.fullName, 120),
    phone: clip(body.phone, 40),
    roleTitle: clip(body.roleTitle, 120),
    timezone: clip(body.timezone, 80),
    avatarUrl: clip(body.avatarUrl, 500),
  };

  const profile = await upsertProfile(
    { id: user.id },
    { id: user.id, email: user.email ?? `${user.id}@no-email.local`, ...fields },
    fields,
  );

  // Mirror the display name into auth metadata (used by the dashboard greeting).
  if (fields.fullName) {
    try {
      await createClient().auth.updateUser({ data: { full_name: fields.fullName, name: fields.fullName } });
    } catch { /* non-fatal — profile row is the source of truth */ }
  }

  return NextResponse.json({ profile });
}
