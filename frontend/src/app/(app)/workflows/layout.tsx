import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Workflows - FlowState', description: 'Build and manage workflows that connect one starting event to an ordered sequence of steps.' };

export default function PageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
