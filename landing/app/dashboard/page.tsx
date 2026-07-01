import { redirect } from 'next/navigation';

// The dashboard now lives inside Pixie Lab. Keep this path working for old
// links/bookmarks by forwarding to the canonical location.
export default function DashboardRedirect() {
  redirect('/pixie-lab/dashboard');
}
