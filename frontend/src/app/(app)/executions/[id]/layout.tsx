import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Run detail - FlowState', description: 'Inspect the status, input, and output of each step in a workflow run.' };

export default function PageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
