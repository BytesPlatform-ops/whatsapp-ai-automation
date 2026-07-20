import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getWizardState,
  approveIdea,
  generateScript,
  createCreatorProfile,
  pollVideo,
} from './contentCreatorClient';

function mockFetchOnce(status: number, body: unknown, ok = status >= 200 && status < 300) {
  (globalThis.fetch as unknown) = vi.fn().mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('contentCreatorClient error classification', () => {
  it('returns ok on 2xx', async () => {
    mockFetchOnce(200, { backendUp: true, current_stage: 'intake', total_stages: 13 });
    const r = await getWizardState();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.current_stage).toBe('intake');
  });

  it('classifies 401 as unauthorized', async () => {
    mockFetchOnce(401, { backendUp: true, error: 'Not signed in' });
    const r = await getWizardState();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('unauthorized');
  });

  it('classifies 403 as forbidden', async () => {
    mockFetchOnce(403, { backendUp: true, error: 'no permission' });
    const r = await getWizardState();
    if (!r.ok) expect(r.error.kind).toBe('forbidden');
    else throw new Error('expected error');
  });

  it('extracts gate from a 409 gate_blocked conflict', async () => {
    mockFetchOnce(409, { backendUp: true, detail: { error: 'gate_blocked', gate: 'idea', detail: 'Idea must be approved (Gate 1).' } });
    const r = await generateScript('ccidea_1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('conflict');
      expect(r.error.gate).toBe('idea');
      expect(r.error.message).toContain('Gate 1');
    }
  });

  it('summarizes a 422 validation error with the field', async () => {
    mockFetchOnce(422, { backendUp: true, detail: [{ loc: ['body', 'tenant_id'], msg: 'field required' }] });
    const r = await createCreatorProfile({});
    if (!r.ok) {
      expect(r.error.kind).toBe('validation');
      expect(r.error.message).toContain('tenant_id');
    } else throw new Error('expected error');
  });

  it('maps a 404 detail string to a not_found message', async () => {
    mockFetchOnce(404, { backendUp: true, detail: 'idea not found for tenant' });
    const r = await approveIdea('missing');
    if (!r.ok) {
      expect(r.error.kind).toBe('not_found');
      expect(r.error.message).toBe('idea not found for tenant');
    } else throw new Error('expected error');
  });

  it('treats backendUp:false (proxy degraded) as offline', async () => {
    mockFetchOnce(200, { backendUp: false, error: 'The content creator service is offline.' });
    const r = await getWizardState();
    if (!r.ok) expect(r.error.kind).toBe('offline');
    else throw new Error('expected error');
  });
});

describe('pollVideo', () => {
  it('returns immediately when the first poll is terminal (mock)', async () => {
    (globalThis.fetch as unknown) = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ backendUp: true, video_id: 'v1', video: { status: 'mock', storage_url: '' } }),
    });
    const seen: string[] = [];
    const r = await pollVideo('v1', { intervalMs: 1, maxAttempts: 5, onUpdate: (v) => seen.push(v.status) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe('mock');
    expect(seen).toEqual(['mock']);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('polls until ready then stops', async () => {
    const responses = ['generating', 'generating', 'ready'];
    let i = 0;
    (globalThis.fetch as unknown) = vi.fn().mockImplementation(async () => ({
      ok: true, status: 200, json: async () => ({ backendUp: true, video: { status: responses[i++], storage_url: i === 3 ? 'https://x/v.mp4' : '' } }),
    }));
    const r = await pollVideo('v1', { intervalMs: 1, maxAttempts: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe('ready');
    expect(i).toBe(3);
  });

  it('is bounded by maxAttempts (never infinite)', async () => {
    (globalThis.fetch as unknown) = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ backendUp: true, video: { status: 'generating' } }),
    });
    const r = await pollVideo('v1', { intervalMs: 1, maxAttempts: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('timed out');
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
  });

  it('stops when the abort signal is already aborted', async () => {
    const spy = vi.fn();
    (globalThis.fetch as unknown) = spy;
    const r = await pollVideo('v1', { signal: AbortSignal.abort(), intervalMs: 1, maxAttempts: 5 });
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
