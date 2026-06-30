import { redirect } from 'next/navigation';

/** /app/dashboard → the enhanced Spotify dashboard at /dashboard (single home). */
export default function AppDashboardRedirect() {
  redirect('/dashboard');
}
