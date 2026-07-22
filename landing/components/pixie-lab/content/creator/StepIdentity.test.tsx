import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { WizardState } from '@/lib/pixie-lab/contentCreatorTypes';

const createIdentityFromCharacteristics = vi.fn();
const uploadIdentityReference = vi.fn();
const invalidateFrom = vi.fn();
vi.mock('@/lib/pixie-lab/contentCreatorClient', () => ({
  createIdentityFromCharacteristics: (...a: unknown[]) => createIdentityFromCharacteristics(...a),
  uploadIdentityReference: (...a: unknown[]) => uploadIdentityReference(...a),
  invalidateFrom: (...a: unknown[]) => invalidateFrom(...a),
}));

import { StepIdentity } from './StepIdentity';

function baseState(identity: WizardState['identity'] = null): WizardState {
  return {
    tenant_id: 'ws', mock: true, dry_run: true, current_stage: 'influencer_setup', complete: false,
    completed_count: 1, total_stages: 13, stages: [],
    gates: { idea: 'pending', script: 'pending', production: 'pending', publish: 'pending' },
    profile: null, profile_id: 'p1', identity, identity_id: identity ? 'i1' : null, provider: null,
    ideas: [], approved_idea_id: null, scripts: [], approved_script_id: null, video: null,
    quality: null, posts: [], metrics: [], learning: null,
  };
}

const props = (identity: WizardState['identity'] = null) => ({
  state: baseState(identity), reload: vi.fn().mockResolvedValue(null),
  advance: vi.fn().mockResolvedValue(undefined), goTo: vi.fn(),
});

function refIdentity(ref: string) {
  return { source: 'reference_image', active: true, reference_ref: ref, reference_hosted: true, reference_asset_id: 'a1', characteristics: {}, locked: true } as WizardState['identity'];
}

beforeEach(() => {
  createIdentityFromCharacteristics.mockReset();
  uploadIdentityReference.mockReset();
  invalidateFrom.mockReset();
  // jsdom has no object-URL support
  (globalThis.URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:preview');
  (globalThis.URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
});

describe('StepIdentity', () => {
  it('offers both methods and defaults to describe for a new identity', () => {
    render(<StepIdentity {...props()} />);
    expect(screen.getByRole('tab', { name: /Upload reference image/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Describe characteristics/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Look/i)).toBeInTheDocument(); // describe form visible
  });

  it('submits the characteristics path', async () => {
    createIdentityFromCharacteristics.mockResolvedValue({ ok: true, data: { id: 'i1', identity: {} } });
    const p = props();
    render(<StepIdentity {...p} />);
    fireEvent.change(screen.getByLabelText(/Look/i), { target: { value: 'athletic' } });
    fireEvent.click(screen.getByRole('button', { name: /Lock identity and continue/i }));
    await waitFor(() => expect(createIdentityFromCharacteristics).toHaveBeenCalled());
    expect(createIdentityFromCharacteristics.mock.calls[0][0]).toMatchObject({ look: 'athletic' });
  });

  it('rejects a non-image file with an inline error', () => {
    render(<StepIdentity {...props()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Upload reference image/i }));
    const input = screen.getByLabelText(/Reference image file/i);
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } });
    expect(screen.getByText(/Use a PNG, JPEG or WEBP image/i)).toBeInTheDocument();
    expect(uploadIdentityReference).not.toHaveBeenCalled();
  });

  it('uploads a valid reference image', async () => {
    uploadIdentityReference.mockResolvedValue({ ok: true, data: { id: 'i1', identity: refIdentity('https://x/y.png') } });
    // deterministic FileReader
    class FR {
      result = 'data:image/png;base64,QUJD';
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      readAsDataURL() { this.onload?.(); }
    }
    vi.stubGlobal('FileReader', FR as unknown as typeof FileReader);
    const p = props();
    render(<StepIdentity {...p} />);
    fireEvent.click(screen.getByRole('tab', { name: /Upload reference image/i }));
    fireEvent.change(screen.getByLabelText(/Reference image file/i), { target: { files: [new File(['abc'], 'face.png', { type: 'image/png' })] } });
    fireEvent.click(screen.getByRole('button', { name: /Lock identity and continue/i }));
    await waitFor(() => expect(uploadIdentityReference).toHaveBeenCalled());
    expect(uploadIdentityReference.mock.calls[0][0]).toMatchObject({ content_type: 'image/png', filename: 'face.png', image_base64: 'QUJD' });
    vi.unstubAllGlobals();
  });

  it('recovers a saved reference image', () => {
    render(<StepIdentity {...props(refIdentity('https://cdn/ref.png'))} />);
    expect(screen.getByText(/Saved reference image/i)).toBeInTheDocument();
    expect(screen.getByAltText(/Reference preview/i)).toHaveAttribute('src', 'https://cdn/ref.png');
  });
});
