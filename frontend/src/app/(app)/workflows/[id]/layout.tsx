import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Workflow studio — FlowState', description: 'Configure your trigger and steps, test the workflow, and review its recorded runs.' };

export default function PageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
