import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Runs - FlowState', description: 'Follow workflow runs, inspect step outputs, and investigate failures.' };

export default function PageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
