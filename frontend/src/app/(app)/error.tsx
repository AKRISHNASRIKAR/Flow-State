'use client';

import { CrashScreen } from '@/components/CrashScreen';

// Inside the app shell, so the sidebar stays usable when one page crashes.
export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <CrashScreen {...props} />;
}
