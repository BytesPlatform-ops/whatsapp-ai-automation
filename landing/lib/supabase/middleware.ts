import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Routes that require a signed-in user. */
const PROTECTED = ['/dashboard', '/pixie-lab', '/app'];
/** Auth routes a signed-in user should be bounced away from. */
const AUTH_ROUTES = ['/login', '/register'];

/**
 * Refreshes the Supabase session cookie on every matched request and enforces
 * route protection:
 *   - not signed in + protected route  → redirect to /login?next=<path>
 *   - signed in + auth route           → redirect to /pixie-lab/dashboard
 * If Supabase isn't configured yet (no env), this is a no-op so the rest of the
 * site keeps working.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response; // not configured → don't block

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: getUser() (not getSession) — it revalidates the token server-side.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(p + '/'));
  const isAuthRoute = AUTH_ROUTES.includes(path);

  if (isProtected && !user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    redirect.search = '';
    redirect.searchParams.set('next', path);
    return NextResponse.redirect(redirect);
  }

  if (isAuthRoute && user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/pixie-lab/dashboard';
    redirect.search = '';
    return NextResponse.redirect(redirect);
  }

  return response;
}
