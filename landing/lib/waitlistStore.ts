import { createAdminClient } from './supabase/admin';

/** A waitlist lead as captured from the Join Pixie swipe deck. */
export interface WaitlistLead {
  email: string;
  name: string;
  business: string;
  contact: string;
  roles: number;
  selected: string[];
  rejected: string[];
  ip?: string;
}

/** A stored row, as returned to the admin panel. */
export interface WaitlistRow extends WaitlistLead {
  id: string;
  created_at: string;
  source: string;
}

const TABLE = 'waitlist_responses';

/**
 * Persist a lead to Supabase. Best-effort: the waitlist route still succeeds on
 * the email even if storage fails (e.g. the table hasn't been created yet), so
 * this returns a result instead of throwing.
 */
export async function storeLead(lead: WaitlistLead): Promise<{ ok: boolean; detail: string }> {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, detail: 'no-supabase-env' };

  const { error } = await supabase.from(TABLE).insert({
    email: lead.email,
    name: lead.name,
    business: lead.business,
    contact: lead.contact,
    roles: lead.roles,
    selected: lead.selected,
    rejected: lead.rejected,
    ip: lead.ip ?? null,
    source: 'join-pixie',
  });

  if (error) return { ok: false, detail: error.message };
  return { ok: true, detail: 'stored' };
}

/** Newest-first list of waitlist leads for the admin panel. */
export async function fetchLeads(limit = 500): Promise<WaitlistRow[]> {
  const supabase = createAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[admin] fetchLeads failed:', error.message);
    return [];
  }
  return (data ?? []) as WaitlistRow[];
}
