import type { Metadata } from 'next';
import { OmniPublic } from '@/components/pixie/OmniPublic';

export const metadata: Metadata = {
  title: 'Pixie Omni — Your central AI business brain',
  description: 'One Pixie brain that listens, routes work to the right agent, asks approval, executes, and learns.',
};

export default function OmniPublicPage() {
  return <OmniPublic />;
}
