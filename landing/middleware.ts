import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/** Edge middleware: refresh the Supabase session + guard dashboard/auth routes.
 *  Scoped to just the auth-relevant paths so the rest of the marketing site and
 *  the tools pages are untouched. */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ['/dashboard/:path*', '/dashboard', '/login', '/register'],
};
