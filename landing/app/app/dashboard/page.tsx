import { redirect } from 'next/navigation';

/** /app/dashboard → the Pixie Lab dashboard (single home). */
export default function AppDashboardRedirect() {
  redirect('/pixie-lab/dashboard');
}
