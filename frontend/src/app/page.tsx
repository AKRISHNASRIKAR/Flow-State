import type { Metadata } from 'next';
import { LandingPage } from '../views/landing/LandingPage';

export const metadata: Metadata = {
  title: 'FlowState — Design it once. Let it run.',
  description:
    'Turn a job you repeat by hand into a workflow: something happens, the steps run in order, and every run is recorded step by step.',
};

export default function Home() {
  return <LandingPage />;
}
