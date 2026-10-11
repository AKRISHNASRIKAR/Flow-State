'use client';

import { Suspense } from 'react';
import { ExecutionsPage } from '@/views/executions/ExecutionsPage';

export default function Page() {
  return <Suspense><ExecutionsPage /></Suspense>;
}
