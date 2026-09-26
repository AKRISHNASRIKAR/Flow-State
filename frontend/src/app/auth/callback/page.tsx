'use client';

import { Suspense } from 'react';
import { AuthCallbackPage } from '@/views/auth/AuthCallbackPage';

export default function Page() {
  return (
    <Suspense>
      <AuthCallbackPage />
    </Suspense>
  );
}
