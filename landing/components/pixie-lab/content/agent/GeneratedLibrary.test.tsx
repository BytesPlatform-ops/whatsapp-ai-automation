import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DocumentEnvelope } from '@/lib/pixie-lab/contentAgentTypes';

const getContentTypes = vi.fn();
const listDocuments = vi.fn();
const deleteDocument = vi.fn();
const duplicateDocument = vi.fn();
const archiveDocument = vi.fn();
const restoreDocument = vi.fn();
const getDocument = vi.fn();

vi.mock('@/lib/pixie-lab/contentAgentClient', () => ({
  getContentTypes: (...a: unknown[]) => getContentTypes(...a),
  listDocuments: (...a: unknown[]) => listDocuments(...a),
  deleteDocument: (...a: unknown[]) => deleteDocument(...a),
  duplicateDocument: (...a: unknown[]) => duplicateDocument(...a),
  archiveDocument: (...a: unknown[]) => archiveDocument(...a),
  restoreDocument: (...a: unknown[]) => restoreDocument(...a),
  getDocument: (...a: unknown[]) => getDocument(...a),
}));

import { GeneratedLibrary } from './GeneratedLibrary';

function doc(id: string, title: string, extra: Partial<DocumentEnvelope['document']> = {}): DocumentEnvelope {
  return {
    id,
    document: {
      user_id: '', content_type: 'social_post', title, status: 'draft', current_version_id: 'v',
      folder: '', tags: [], media_asset_ids: [], campaign_ref: '', settings: {},
      created_at: '2026-07-20T00:00:00Z', updated_at: '2026-07-20T00:00:00Z', archived_at: '', ...extra,
    },
  };
}

beforeEach(() => {
  getContentTypes.mockResolvedValue({ ok: true, data: { content_types: [{ content_type: 'social_post', label: 'Social media post', icon: 'megaphone', description: '', example: '', structured: false, fields: [], controls: [] }] } });
  listDocuments.mockResolvedValue({ ok: true, data: { total: 2, page: 1, page_size: 12, documents: [doc('cadoc_1', 'Summer sale'), doc('cadoc_2', 'Winter blog')] } });
  deleteDocument.mockResolvedValue({ ok: true, data: { id: 'cadoc_1', deleted: true } });
  duplicateDocument.mockResolvedValue({ ok: true, data: { id: 'cadoc_3', document: doc('cadoc_3', 'copy').document } });
  [deleteDocument, duplicateDocument, archiveDocument, restoreDocument, getDocument].forEach((m) => m.mockClear?.());
});

describe('GeneratedLibrary', () => {
  it('lists documents from the client', async () => {
    render(<GeneratedLibrary />);
    expect(await screen.findByText('Summer sale')).toBeInTheDocument();
    expect(screen.getByText('Winter blog')).toBeInTheDocument();
  });

  it('passes the search query to the client', async () => {
    render(<GeneratedLibrary />);
    await screen.findByText('Summer sale');
    fireEvent.change(screen.getByLabelText(/Search content/i), { target: { value: 'summer' } });
    await waitFor(() => expect(listDocuments.mock.calls.some((c) => c[0]?.query === 'summer')).toBe(true));
  });

  it('filters by content type', async () => {
    render(<GeneratedLibrary />);
    await screen.findByText('Summer sale');
    fireEvent.change(screen.getByLabelText(/Filter by type/i), { target: { value: 'social_post' } });
    await waitFor(() => expect(listDocuments.mock.calls.some((c) => c[0]?.content_type === 'social_post')).toBe(true));
  });

  it('confirms before deleting', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GeneratedLibrary />);
    await screen.findByText('Summer sale');
    fireEvent.click(screen.getAllByLabelText('Delete')[0]);
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('cadoc_1'));
    confirmSpy.mockRestore();
  });

  it('does not delete when confirmation is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<GeneratedLibrary />);
    await screen.findByText('Summer sale');
    fireEvent.click(screen.getAllByLabelText('Delete')[0]);
    expect(deleteDocument).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('shows an empty state when there are no documents', async () => {
    listDocuments.mockResolvedValue({ ok: true, data: { total: 0, page: 1, page_size: 12, documents: [] } });
    render(<GeneratedLibrary />);
    expect(await screen.findByText(/No content yet/i)).toBeInTheDocument();
  });

  it('surfaces an error state', async () => {
    listDocuments.mockResolvedValue({ ok: false, error: { kind: 'offline', status: 0, message: 'service is offline' } });
    render(<GeneratedLibrary />);
    expect(await screen.findByText(/service is offline/i)).toBeInTheDocument();
  });
});
