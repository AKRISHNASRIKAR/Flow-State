'use client';

import { Suspense } from 'react';
import { WorkflowsListPage } from '@/views/workflows/WorkflowsListPage';

export default function Page() {
  return (
    <Suspense>
      <WorkflowsListPage />
    </Suspense>
  );
}
