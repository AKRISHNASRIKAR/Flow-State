import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign in - FlowState', description: 'Sign in or create your FlowState workspace with Google.' };

export default function PageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
