'use client';

import { useThemeStore } from '../lib/theme-store';
import { Button, Icon } from './ui';

const SUN_PATH = 'M12 3v1.5m0 15V21M3 12h1.5m15 0H21M5.636 5.636l1.06 1.06m10.608 10.608 1.06 1.06M5.636 18.364l1.06-1.06M17.304 6.696l1.06-1.06M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z';
const MOON_PATH = 'M20.985 12.486a9 9 0 1 1-9.473-9.472 7.5 7.5 0 0 0 9.473 9.472Z';

export function ThemeControl() {
  const resolved = useThemeStore((state) => state.resolved);
  const setPreference = useThemeStore((state) => state.setPreference);
  const dark = resolved === 'dark';
  return (
    <Button
      variant="secondary"
      role="switch"
      aria-label="Dark theme"
      aria-checked={dark}
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setPreference(dark ? 'light' : 'dark')}
      className="theme-toggle relative h-11 w-[88px] shrink-0 !gap-0 !p-1"
    >
      <span aria-hidden className={`theme-toggle-thumb absolute inset-y-1 left-1 w-10 rounded-[4px] border border-rule bg-paper-2 ${dark ? 'translate-x-10' : 'translate-x-0'}`} />
      <span className={`theme-toggle-icon relative flex h-9 w-10 items-center justify-center ${dark ? 'text-muted' : 'text-ink'}`}><Icon path={SUN_PATH} className={`size-5 transition-transform duration-[var(--theme-transition-duration)] ${dark ? '-rotate-45 scale-90' : 'rotate-0 scale-100'}`} /></span>
      <span className={`theme-toggle-icon relative flex h-9 w-10 items-center justify-center ${dark ? 'text-ink' : 'text-muted'}`}><Icon path={MOON_PATH} className={`size-5 transition-transform duration-[var(--theme-transition-duration)] ${dark ? 'rotate-0 scale-100' : 'rotate-45 scale-90'}`} /></span>
    </Button>
  );
}
