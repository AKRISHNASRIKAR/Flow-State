'use client';

import { useThemeStore, type ThemePreference } from '../lib/theme-store';

export function ThemeControl() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  return (
    <label className="flex shrink-0 items-center gap-2 text-xs text-muted">
      <span className="hidden sm:inline">Theme</span>
      <select aria-label="Color theme" value={preference} onChange={(event) => setPreference(event.target.value as ThemePreference)} className="min-h-11 max-w-full rounded-md border border-rule bg-card px-3 text-sm text-ink transition-colors hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
        <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
      </select>
    </label>
  );
}
