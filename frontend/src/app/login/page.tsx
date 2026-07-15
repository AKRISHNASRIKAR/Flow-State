'use client';

import { Suspense } from 'react';
import { LoginPage } from '@/views/auth/LoginPage';

export default function Page() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
