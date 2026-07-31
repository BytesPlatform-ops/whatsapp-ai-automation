import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Unified into the full-service workspace — kept as a stable redirect so existing
// links to /pixie-lab/marketing/content continue to work.
export default function Page() {
  redirect('/pixie-lab/marketing/full-service?tab=content');
}
