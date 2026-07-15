'use client';

import { Suspense } from 'react';
import { WorkflowDetailPage } from '@/views/workflows/WorkflowDetailPage';

export default function Page() {
  return (
    <Suspense>
      <WorkflowDetailPage />
    </Suspense>
  );
}
