'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Save, Check, Plus, Trash2, Pencil, X, BookOpen, HelpCircle } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpBusinessProfile, RcpKnowledgeItem } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Section, Field, TextInput, TextArea, PrimaryButton, GhostButton, RCP_ACCENT } from './widgets';

type Status = 'loading' | 'offline' | 'ready';
type Faq = { q?: string; a?: string };

const splitList = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean);
const joinList = (a?: string[]): string => (a || []).join(', ');

/* ------------------------------ Profile editor ------------------------------ */

function ProfileEditor({ initial }: { initial: RcpBusinessProfile }) {
  const [form, setForm] = useState<RcpBusinessProfile>(initial);
  const [servicesText, setServicesText] = useState(joinList(initial.services));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setForm(initial); setServicesText(joinList(initial.services)); }, [initial]);

  const set = (k: keyof RcpBusinessProfile, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    setSaved(false);
    const patch: Partial<RcpBusinessProfile> = {
      business_name: form.business_name,
      industry: form.industry,
      hours: form.hours,
      services: splitList(servicesText),
      pricing_notes: form.pricing_notes,
      location: form.location,
      address: form.address,
      phone: form.phone,
      email: form.email,
      website: form.website,
      policies: form.policies,
      process: form.process,
      tone: form.tone,
      escalation_rules: form.escalation_rules,
      custom_instructions: form.custom_instructions,
    };
    await receptionistApi.updateBusinessProfile(patch);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Card className="p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name"><TextInput value={form.business_name || ''} onChange={(e) => set('business_name', e.target.value)} /></Field>
        <Field label="Industry"><TextInput value={form.industry || ''} onChange={(e) => set('industry', e.target.value)} /></Field>
        <Field label="Hours"><TextInput value={form.hours || ''} onChange={(e) => set('hours', e.target.value)} placeholder="Mon–Fri 9–5" /></Field>
        <Field label="Services (comma-separated)"><TextInput value={servicesText} onChange={(e) => setServicesText(e.target.value)} placeholder="Websites, Logos, SEO" /></Field>
        <Field label="Location"><TextInput value={form.location || ''} onChange={(e) => set('location', e.target.value)} /></Field>
        <Field label="Address"><TextInput value={form.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Phone"><TextInput value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email"><TextInput type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Website"><TextInput value={form.website || ''} onChange={(e) => set('website', e.target.value)} /></Field>
        <Field label="Tone"><TextInput value={form.tone || ''} onChange={(e) => set('tone', e.target.value)} placeholder="Friendly, concise" /></Field>
      </div>

      <div className="mt-4 grid gap-4">
        <Field label="Pricing notes"><TextArea rows={2} value={form.pricing_notes || ''} onChange={(e) => set('pricing_notes', e.target.value)} /></Field>
        <Field label="Policies"><TextArea rows={3} value={form.policies || ''} onChange={(e) => set('policies', e.target.value)} /></Field>
        <Field label="Process"><TextArea rows={3} value={form.process || ''} onChange={(e) => set('process', e.target.value)} /></Field>
        <Field label="Escalation rules"><TextArea rows={3} value={form.escalation_rules || ''} onChange={(e) => set('escalation_rules', e.target.value)} /></Field>
        <Field label="Custom instructions"><TextArea rows={3} value={form.custom_instructions || ''} onChange={(e) => set('custom_instructions', e.target.value)} /></Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <PrimaryButton onClick={() => void save()} disabled={saving}>
          {saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save profile</>}
        </PrimaryButton>
        {saved && <span className="text-[12.5px] font-semibold text-[var(--pl-green)]">Saved ✓</span>}
      </div>
    </Card>
  );
}

/* ------------------------------ FAQ editor ------------------------------ */

function FaqEditor({ initial }: { initial: Faq[] }) {
  const [faqs, setFaqs] = useState<Faq[]>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setFaqs(initial); }, [initial]);

  const update = (i: number, k: keyof Faq, v: string) => setFaqs((f) => f.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));
  const add = () => setFaqs((f) => [...f, { q: '', a: '' }]);
  const remove = (i: number) => setFaqs((f) => f.filter((_, idx) => idx !== i));

  async function save() {
    setSaving(true);
    setSaved(false);
    const clean = faqs.filter((f) => (f.q || '').trim() || (f.a || '').trim());
    await receptionistApi.updateBusinessProfile({ faqs: clean });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Card className="p-5">
      {faqs.length === 0 ? (
        <p className="text-[13px] text-[var(--pl-text-muted)]">No FAQs yet. Add one to help the receptionist answer common questions.</p>
      ) : (
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <TextInput value={f.q || ''} onChange={(e) => update(i, 'q', e.target.value)} placeholder="Question" />
                  <TextArea rows={2} value={f.a || ''} onChange={(e) => update(i, 'a', e.target.value)} placeholder="Answer" />
                </div>
                <button onClick={() => remove(i)} className="mt-1 rounded-lg border border-[var(--pl-border)] p-1.5 text-[var(--pl-text-muted)] transition hover:text-red-500" aria-label="Remove FAQ">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <GhostButton onClick={add}><Plus size={13} /> Add FAQ</GhostButton>
        <PrimaryButton onClick={() => void save()} disabled={saving}>
          {saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save FAQs</>}
        </PrimaryButton>
      </div>
    </Card>
  );
}

/* ------------------------------ Knowledge base ------------------------------ */

function KnowledgeItemRow({ item, onSaved, onDeleted }: { item: RcpKnowledgeItem; onSaved: () => void; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: item.title || '', content: item.content || '', category: item.category || '', tags: joinList(item.tags) });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await receptionistApi.updateKnowledge(item.id, {
      title: form.title,
      content: form.content,
      category: form.category || undefined,
      tags: splitList(form.tags),
    });
    setBusy(false);
    setEditing(false);
    onSaved();
  }

  async function del() {
    setBusy(true);
    await receptionistApi.deleteKnowledge(item.id);
    setBusy(false);
    onDeleted();
  }

  if (editing) {
    return (
      <Card className="p-4">
        <div className="space-y-2">
          <TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" />
          <TextArea rows={3} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Content" />
          <div className="grid gap-2 sm:grid-cols-2">
            <TextInput value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" />
            <TextInput value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="tags, comma-separated" />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <PrimaryButton onClick={() => void save()} disabled={busy}><Save size={13} /> Save</PrimaryButton>
          <GhostButton onClick={() => setEditing(false)} disabled={busy}><X size={13} /> Cancel</GhostButton>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-[14px] font-bold text-[var(--pl-text)]">{item.title || 'Untitled'}</p>
            {item.category && <span className="rounded-md bg-[var(--pl-surface-soft)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--pl-text-muted)]">{item.category}</span>}
          </div>
          {item.content && <p className="mt-1 whitespace-pre-wrap text-[13px] text-[var(--pl-text-soft)]">{item.content}</p>}
          {(item.tags || []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(item.tags || []).map((t) => (
                <span key={t} className="rounded-md bg-[var(--pl-surface-soft)] px-1.5 py-0.5 text-[10.5px] text-[var(--pl-text-muted)]">#{t}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => setEditing(true)} className="rounded-lg border border-[var(--pl-border)] p-1.5 text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]" aria-label="Edit"><Pencil size={14} /></button>
          <button onClick={() => void del()} disabled={busy} className="rounded-lg border border-[var(--pl-border)] p-1.5 text-[var(--pl-text-muted)] transition hover:text-red-500 disabled:opacity-50" aria-label="Delete"><Trash2 size={14} /></button>
        </div>
      </div>
    </Card>
  );
}

function AddKnowledgeForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ title: '', content: '', category: '', tags: '' });
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!form.title.trim() || !form.content.trim()) return;
    setBusy(true);
    await receptionistApi.createKnowledge({
      title: form.title,
      content: form.content,
      category: form.category || undefined,
      tags: splitList(form.tags),
    });
    setBusy(false);
    setForm({ title: '', content: '', category: '', tags: '' });
    onCreated();
  }

  return (
    <Card className="p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Add knowledge</p>
      <div className="space-y-2">
        <TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" />
        <TextArea rows={3} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Content the receptionist can reference" />
        <div className="grid gap-2 sm:grid-cols-2">
          <TextInput value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category (optional)" />
          <TextInput value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="tags, comma-separated" />
        </div>
      </div>
      <div className="mt-3">
        <PrimaryButton onClick={() => void create()} disabled={busy || !form.title.trim() || !form.content.trim()}><Plus size={14} /> Add</PrimaryButton>
      </div>
    </Card>
  );
}

/* ------------------------------ Panel ------------------------------ */

export function KnowledgePanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [profile, setProfile] = useState<RcpBusinessProfile>({});
  const [items, setItems] = useState<RcpKnowledgeItem[]>([]);

  const loadKnowledge = useCallback(async () => {
    const k = await receptionistApi.getKnowledge();
    setItems(Array.isArray(k.items) ? k.items : []);
  }, []);

  const load = useCallback(async () => {
    setStatus('loading');
    const [p, k] = await Promise.all([receptionistApi.getBusinessProfile(), receptionistApi.getKnowledge()]);
    if (!p.backendUp) return setStatus('offline');
    setProfile(p.profile || {});
    setItems(Array.isArray(k.items) ? k.items : []);
    setStatus('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (status === 'loading') {
    return (
      <div className="mt-6 space-y-4">
        <LoadingCards count={1} height="h-64" />
        <LoadingCards count={2} height="h-24" />
      </div>
    );
  }

  if (status === 'offline') {
    return (
      <div className="mt-6">
        <OfflineState service="receptionist" action={<GhostButton onClick={() => void load()}><RefreshCw size={13} /> Retry</GhostButton>} />
      </div>
    );
  }

  return (
    <div className="mt-2">
      <Section title="Business profile" sub="The context the AI Receptionist uses in every reply">
        <ProfileEditor initial={profile} />
      </Section>

      <Section title="FAQs" sub="Common questions and the answers to give">
        <FaqEditor initial={profile.faqs || []} />
      </Section>

      <Section title="Knowledge base" sub="Reference documents the receptionist can pull from" right={<span className="inline-flex items-center gap-1 text-[12px] text-[var(--pl-text-muted)]"><BookOpen size={13} /> {items.length} item{items.length === 1 ? '' : 's'}</span>}>
        <div className="space-y-3">
          <AddKnowledgeForm onCreated={() => void loadKnowledge()} />
          {items.length === 0 ? (
            <Card className="p-6 text-center">
              <HelpCircle size={22} className="mx-auto text-[var(--pl-text-muted)]" />
              <p className="mt-2 text-[13px] text-[var(--pl-text-muted)]">No knowledge items yet. Add one above.</p>
            </Card>
          ) : (
            items.map((it) => (
              <KnowledgeItemRow key={it.id} item={it} onSaved={() => void loadKnowledge()} onDeleted={() => void loadKnowledge()} />
            ))
          )}
        </div>
      </Section>
    </div>
  );
}
