import { redirect, notFound } from 'next/navigation';

const VALID = ['website', 'receptionist', 'seo', 'marketing', 'content'];

export default function Page({ params }: { params: { agent: string } }) {
  if (!VALID.includes(params.agent)) notFound();
  redirect(`/pixie-lab/${params.agent}`);
}
