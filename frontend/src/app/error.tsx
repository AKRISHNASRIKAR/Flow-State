'use client';

import { CrashScreen } from '@/components/CrashScreen';

export default function RootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <CrashScreen {...props} />;
}
