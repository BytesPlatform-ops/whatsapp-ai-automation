import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getContentTypes,
  generateContent,
  listDocuments,
  regenerateDocument,
  setCurrentVersion,
} from './contentAgentClient';

function mockFetchOnce(status: number, body: unknown, ok = status >= 200 && status < 300) {
  (globalThis.fetch as unknown) = vi.fn().mockResolvedValueOnce({ ok, status, json: async () => body });
}

function captureFetch(status: number, body: unknown) {
  const spy = vi.fn().mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => body });
  (globalThis.fetch as unknown) = spy;
  return spy;
}

afterEach(() => vi.restoreAllMocks());

describe('contentAgentClient error classification', () => {
  it('returns ok on 2xx', async () => {
    mockFetchOnce(200, { backendUp: true, content_types: [] });
    const r = await getContentTypes();
    expect(r.ok).toBe(true);
  });

  it('classifies 401 as unauthorized', async () => {
    mockFetchOnce(401, { backendUp: true, error: 'Not signed in' });
    const r = await getContentTypes();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('unauthorized');
  });

  it('classifies 403 as forbidden', async () => {
    mockFetchOnce(403, { backendUp: true, error: 'no permission' });
    const r = await listDocuments();
    if (!r.ok) expect(r.error.kind).toBe('forbidden');
  });

  it('classifies 404 as not_found', async () => {
    mockFetchOnce(404, { backendUp: true, detail: 'document not found for tenant' });
    const r = await regenerateDocument('cadoc_x');
    if (!r.ok) {
      expect(r.error.kind).toBe('not_found');
      expect(r.error.message).toContain('not found');
    }
  });

  it('surfaces missing_inputs validation fields', async () => {
    mockFetchOnce(422, { backendUp: true, detail: { error: 'missing_inputs', fields: ['platform'], message: 'Missing required input(s): platform.' } });
    const r = await generateContent({ contentType: 'social_post', inputs: { topic: 'x' } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('validation');
      expect(r.error.fields).toEqual(['platform']);
    }
  });

  it('maps 503 to provider_unavailable', async () => {
    mockFetchOnce(503, { backendUp: true, detail: { status: 'provider_unavailable', message: 'The content provider is not configured.' } });
    const r = await generateContent({ contentType: 'blog', inputs: { topic: 'x' } });
    if (!r.ok) expect(r.error.kind).toBe('provider_unavailable');
  });

  it('treats backendUp:false as offline', async () => {
    mockFetchOnce(200, { backendUp: false, error: 'The content agent service is offline.' });
    const r = await listDocuments();
    if (!r.ok) expect(r.error.kind).toBe('offline');
  });

  it('treats a network throw as offline', async () => {
    (globalThis.fetch as unknown) = vi.fn().mockRejectedValueOnce(new TypeError('fail'));
    const r = await getContentTypes();
    if (!r.ok) expect(r.error.kind).toBe('offline');
  });
});

describe('contentAgentClient request shaping', () => {
  it('never sends a tenant_id and forwards form values to inputs + options', async () => {
    const spy = captureFetch(200, { backendUp: true, saved: false, result: { variations: [] } });
    await generateContent({ contentType: 'social_post', inputs: { topic: 'sale', platform: 'instagram' }, options: { variations: 3 } });
    const [, init] = spy.mock.calls[0];
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.tenant_id).toBeUndefined();
    expect(sent.content_type).toBe('social_post');
    expect(sent.inputs.topic).toBe('sale');
    // flat values are merged into options so platform reaches GenerationOptions
    expect(sent.options.platform).toBe('instagram');
    expect(sent.options.variations).toBe(3);
  });

  it('encodes the document id in the path', async () => {
    const spy = captureFetch(200, { backendUp: true, current_version_id: 'v1' });
    await setCurrentVersion('cadoc_a/b', 'cav_1');
    const [url] = spy.mock.calls[0];
    expect(String(url)).toContain('cadoc_a%2Fb');
  });

  it('encodes list query params', async () => {
    const spy = captureFetch(200, { backendUp: true, total: 0, documents: [] });
    await listDocuments({ query: 'summer', content_type: 'blog', page: 2, include_archived: true });
    const [url] = spy.mock.calls[0];
    const s = String(url);
    expect(s).toContain('query=summer');
    expect(s).toContain('content_type=blog');
    expect(s).toContain('page=2');
    expect(s).toContain('include_archived=true');
  });
});
