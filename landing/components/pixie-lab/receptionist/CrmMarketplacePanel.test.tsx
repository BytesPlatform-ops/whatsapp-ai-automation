import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('@/lib/pixie-lab/servicesClient', () => ({
  receptionistApi: {
    getCrmCatalog: vi.fn(),
    getCrmStatus: vi.fn(),
    getCrmConflicts: vi.fn(),
    getCrmAnalytics: vi.fn(),
    connectCrm: vi.fn(),
    crmImport: vi.fn(),
    crmSyncNow: vi.fn(),
    resolveCrmConflict: vi.fn(),
    crmProviderAction: vi.fn(),
  },
}));

import CrmMarketplacePanel from './CrmMarketplacePanel';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';

const api = vi.mocked(receptionistApi);

beforeEach(() => {
  vi.clearAllMocks();
  api.getCrmCatalog.mockResolvedValue({ backendUp: true, marketplace_enabled: true,
    catalog: [
      { provider: 'hubspot', name: 'HubSpot', label: 'stable', supported_objects: ['contact', 'deal'], webhook_support: true },
      { provider: 'salesforce', name: 'Salesforce', label: 'stable', supported_objects: ['lead', 'contact'], webhook_support: true }],
    connections: [] } as never);
  api.getCrmStatus.mockResolvedValue({ backendUp: true,
    connection: { connected: true, provider: 'hubspot', account_id: 'a1', read: true, write: false,
      sync_direction: 'import_only', state: 'sync_paused' } } as never);
  api.getCrmConflicts.mockResolvedValue({ backendUp: true, conflicts: [] } as never);
  api.getCrmAnalytics.mockResolvedValue({ backendUp: true,
    analytics: { records_imported: 0, stored_mappings: 0, open_conflicts: 0, outbound_writes: 0, failed_records: 0 } } as never);
});

describe('CrmMarketplacePanel', () => {
  it('lists all connectors from the catalog', async () => {
    render(<CrmMarketplacePanel />);
    expect(await screen.findByText('HubSpot')).toBeInTheDocument();
    expect(screen.getByText('Salesforce')).toBeInTheDocument();
  });

  it('shows a disabled banner when marketplace is off', async () => {
    api.getCrmCatalog.mockResolvedValue({ backendUp: true, marketplace_enabled: false, catalog: [], connections: [] } as never);
    render(<CrmMarketplacePanel />);
    await waitFor(() => expect(screen.getByText(/CRM marketplace is disabled/)).toBeInTheDocument());
  });

  it('connecting a provider calls the client with import-only default', async () => {
    api.connectCrm.mockResolvedValue({ backendUp: true, status: 'connected', capabilities: [] } as never);
    render(<CrmMarketplacePanel />);
    await screen.findByText('HubSpot');
    fireEvent.click(screen.getAllByRole('button', { name: /Connect/i })[0]);
    await waitFor(() => expect(api.connectCrm).toHaveBeenCalledWith('hubspot', expect.objectContaining({ account_id: 'hubspot_acct_1' })));
  });

  it('opening a connected provider shows write-off and sync controls', async () => {
    api.getCrmCatalog.mockResolvedValue({ backendUp: true, marketplace_enabled: true,
      catalog: [{ provider: 'hubspot', name: 'HubSpot', supported_objects: ['contact'] }],
      connections: [{ provider: 'hubspot', connected: true, state: 'sync_paused', write: false }] } as never);
    render(<CrmMarketplacePanel />);
    fireEvent.click(await screen.findByText('HubSpot'));
    expect(await screen.findByText(/write off/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start import' })).toBeInTheDocument();
  });

  it('resolving a conflict keeps Pixie value', async () => {
    api.getCrmCatalog.mockResolvedValue({ backendUp: true, marketplace_enabled: true,
      catalog: [{ provider: 'hubspot', name: 'HubSpot', supported_objects: ['contact'] }],
      connections: [{ provider: 'hubspot', connected: true, state: 'connected' }] } as never);
    api.getCrmConflicts.mockResolvedValue({ backendUp: true,
      conflicts: [{ id: 'cf1', object_type: 'contact', record_id: 'r1', kind: 'field_conflict', state: 'open' }] } as never);
    api.resolveCrmConflict.mockResolvedValue({ backendUp: true, status: 'resolved' } as never);
    render(<CrmMarketplacePanel />);
    fireEvent.click(await screen.findByText('HubSpot'));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep Pixie' }));
    await waitFor(() => expect(api.resolveCrmConflict).toHaveBeenCalledWith('hubspot', 'cf1', 'pixie_selected'));
  });

  it('offline state is honest', async () => {
    api.getCrmCatalog.mockResolvedValue({ backendUp: false } as never);
    render(<CrmMarketplacePanel />);
    await waitFor(() => expect(screen.getByText(/offline|setup/i)).toBeInTheDocument());
  });
});
