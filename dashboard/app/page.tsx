import { ServicesDashboard } from '@/components/ServicesDashboard';

export default function Page({ searchParams }: { searchParams: { tenant?: string } }) {
  return <ServicesDashboard tenant={searchParams.tenant || 'demo'} />;
}
