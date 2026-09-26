/**
 * "What's new" entries, newest first. Only things that have shipped — this
 * panel is a promise to the user, so it follows the same rule as the rest of
 * the UI: never describe what the engine can't do yet. Add an entry in the
 * same change that ships the feature; `id` must be unique and never reused
 * (it's how "unread" is tracked).
 */
export interface ChangelogEntry {
  id: string;
  date: string; // ISO date
  title: string;
  body: string;
  /** Where to see it, if there's a single place. */
  href?: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-09-26-simpler-dashboard',
    date: '2026-09-26',
    title: 'A simpler dashboard',
    body:
      'Set up how a workflow starts by clicking the first box on its canvas — there’s no separate Trigger tab any more. Steps open in a side panel, a checklist on each workflow shows what’s left to do, and statuses read On / Paused / Draft. Every error now appears as a notification, with a Retry button when something fails to load.',
    href: '/workflows',
  },
  {
    id: '2026-09-26-google-sign-in',
    date: '2026-09-26',
    title: 'Sign in with Google',
    body:
      'Google is now the only way to sign in — no password to remember. If you had an account before, signing in with a Google account that uses the same email keeps all your workflows.',
  },
  {
    id: '2026-09-25-retries-resume',
    date: '2026-09-25',
    title: 'Retries pick up where they failed',
    body:
      'When a run fails and is retried, steps that already succeeded are skipped instead of running again — so an email that already went out isn’t sent twice. The run page shows each attempt separately.',
    href: '/executions',
  },
  {
    id: '2026-09-25-http-chaining',
    date: '2026-09-25',
    title: 'Use a web request’s response in later steps',
    body:
      'After an HTTP request step, later steps can use its response: {{payload.http.status}} for the status code and {{payload.http.body.…}} for any field in the reply.',
  },
];

export const LATEST_CHANGELOG_ID = CHANGELOG[0]?.id ?? '';
