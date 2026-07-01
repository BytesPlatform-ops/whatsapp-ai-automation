import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { displayName, tenantForUser } from '@/lib/supabase/auth';
import { PixieLabShell } from '@/components/pixie-lab/PixieLabShell';
import { ThemeProvider, themeInitScript } from '@/components/pixie-lab/theme/ThemeProvider';

export const dynamic = 'force-dynamic';

function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export default async function PixieLabLayout({ children }: { children: React.ReactNode }) {
  let user = null;
  if (configured()) {
    try {
      user = (await createClient().auth.getUser()).data.user;
    } catch {
      user = null;
    }
    // Returning users who haven't completed Quick Setup go there first. (When
    // Supabase isn't configured — local/demo — we skip the gate so the Lab is
    // still browsable.)
    if (user && (user.user_metadata as Record<string, unknown> | undefined)?.onboarded !== true) {
      redirect('/quick-setup');
    }
  }
  return (
    <>
      {/* Set the theme on <html> before paint so there's no light→dark flash. */}
      <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      <ThemeProvider>
        <PixieLabShell name={displayName(user)} tenant={tenantForUser(user)}>
          {children}
        </PixieLabShell>
      </ThemeProvider>
    </>
  );
}
