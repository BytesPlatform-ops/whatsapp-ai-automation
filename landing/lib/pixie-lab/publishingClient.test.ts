import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPublishJob, listJobs, cancelJob, getPublishingConfig } from './publishingClient';

function mockFetchOnce(status: number, body: unknown, ok = status >= 200 && status < 300) {
  (globalThis.fetch as unknown) = vi.fn().mockResolvedValueOnce({ ok, status, json: async () => body });
}
function capture(status: number, body: unknown) {
  const spy = vi.fn().mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => body });
  (globalThis.fetch as unknown) = spy;
  return spy;
}
afterEach(() => vi.restoreAllMocks());

describe('publishingClient', () => {
  it('returns ok on 2xx', async () => {
    mockFetchOnce(200, { backendUp: true, publish_mode: 'dry_run', live_allowed: false });
    const r = await getPublishingConfig();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.publish_mode).toBe('dry_run');
  });

  it('classifies gate_blocked from structured detail', async () => {
    mockFetchOnce(409, { backendUp: true, detail: { error: 'gate_blocked', message: 'Gate 4 required.' } });
    const r = await createPublishJob({ sourceProduct: 'ai_influencer', connectionId: 'facebook:P', platform: 'facebook', contentFormat: 'video' });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error.kind).toBe('gate_blocked'); expect(r.error.message).toMatch(/Gate 4/); }
  });

  it('classifies live_disabled', async () => {
    mockFetchOnce(409, { backendUp: true, detail: { error: 'live_disabled', message: 'Live publishing is disabled.' } });
    const r = await createPublishJob({ sourceProduct: 'content_agent', connectionId: 'facebook:P', platform: 'facebook', contentFormat: 'text', mode: 'live', confirm: true });
    if (!r.ok) expect(r.error.kind).toBe('live_disabled');
  });

  it('classifies 401/404/422', async () => {
    mockFetchOnce(401, { backendUp: true, error: 'Not signed in' });
    expect((await listJobs()).ok).toBe(false);
    mockFetchOnce(404, { backendUp: true, detail: 'publish job not found for tenant' });
    const nf = await cancelJob('x');
    if (!nf.ok) expect(nf.error.kind).toBe('not_found');
  });

  it('treats backendUp:false as offline', async () => {
    mockFetchOnce(200, { backendUp: false, error: 'offline' });
    const r = await listJobs();
    if (!r.ok) expect(r.error.kind).toBe('offline');
  });

  it('never sends a tenant_id and maps fields', async () => {
    const spy = capture(200, { backendUp: true, id: 'j1', created: true });
    await createPublishJob({ sourceProduct: 'content_agent', connectionId: 'facebook:P', platform: 'facebook', contentFormat: 'text', text: 'hi', scheduledLocal: '2099-01-01T09:00', timezone: 'UTC' });
    const [, init] = spy.mock.calls[0];
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.tenant_id).toBeUndefined();
    expect(sent.connection_id).toBe('facebook:P');
    expect(sent.scheduled_local).toBe('2099-01-01T09:00');
    expect(sent.mode).toBe('dry_run');
  });

  it('encodes the job id in the path', async () => {
    const spy = capture(200, { backendUp: true, id: 'a:b', job: {} });
    await cancelJob('facebook:PAGE/1');
    const [url] = spy.mock.calls[0];
    expect(String(url)).toContain('facebook%3APAGE%2F1');
  });
});
