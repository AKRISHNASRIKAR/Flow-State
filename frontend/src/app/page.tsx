import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'FlowState — Workflow Automation Engine',
  description:
    'Build trigger-driven automation pipelines with a visual editor. Self-hosted, open source, and free.',
};

const GITHUB_URL = 'https://github.com/AKRISHNASRIKAR/Flow-State';

// 24x24 Heroicons outline path data, inlined — the same glyphs the dashboard
// uses, so the marketing page and the app stay visually consistent.
const ICONS = {
  workflows:
    'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z',
  bolt: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
  shield:
    'M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z',
} as const;

const PRIMARY_BUTTON =
  'inline-flex cursor-pointer items-center justify-center rounded-xl bg-indigo-600 px-8 py-3 font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500';

function Icon({ path, className }: { path: string; className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

// Mirrors a real chain the engine can actually run: one trigger, then actions
// in order. Kept in sync with the five shipped action types — do not add steps
// here that ActionExecutorService can't execute.
const DEMO_STEPS = [
  { icon: '🌐', label: 'HTTP Request', description: 'GET https://api.example.com/orders' },
  { icon: '✉️', label: 'Send Email', description: 'Notify ops@example.com via Resend' },
  { icon: '💬', label: 'Telegram Notify', description: 'Post the summary to your team chat' },
];

const FEATURES = [
  {
    icon: ICONS.workflows,
    accent: 'bg-indigo-500/10 text-indigo-400 ring-indigo-500/20',
    title: 'Visual Workflow Builder',
    description:
      'Compose triggers and actions on an interactive canvas. Drag, reorder, and configure steps without writing a single line of code.',
  },
  {
    icon: ICONS.bolt,
    accent: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
    title: 'Event-Driven Execution',
    description:
      'Webhooks, scheduled polling, or manual triggers fire workflows into a durable Redis queue. Every step is retried, logged, and auditable.',
  },
  {
    icon: ICONS.shield,
    accent: 'bg-amber-500/10 text-amber-400 ring-amber-500/20',
    title: 'Self-Hosted & Open Source',
    description:
      'Deploy on your own infrastructure. No vendor lock-in, no usage caps, no data leaving your network. MIT licensed.',
  },
];

export default function Home() {
  return (
    <div className="bg-black">
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                              */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-24">
        <span
          aria-hidden
          className="animate-grid-pan pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#262626_1px,transparent_1px),linear-gradient(to_bottom,#262626_1px,transparent_1px)] opacity-40 [background-size:24px_24px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/3 size-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[120px]"
        />

        <div className="relative z-10 flex flex-col items-center text-center">
          <span className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs text-neutral-400 ring-1 ring-neutral-800">
            Open Source · Self-Hosted
          </span>

          <h1 className="mt-8 text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Automate <span className="text-indigo-400">workflows</span>.
            <br />
            Ship faster.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-400">
            Build trigger-driven automation pipelines with a visual editor. Connect webhooks, schedule polls, send
            emails and Telegram messages — all self-hosted.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            {/* /login bounces an already-restored session straight to
                /workflows, so one link serves both visitor and returning user. */}
            <Link href="/login" className={PRIMARY_BUTTON}>
              Get Started
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-neutral-900 px-8 py-3 font-semibold text-neutral-300 ring-1 ring-neutral-800 transition hover:bg-neutral-800 hover:text-white"
            >
              View on GitHub
            </a>
          </div>

          {/* Static illustration of a chain — plain divs, not React Flow, so the
              hero stays a Server Component with no canvas JS on first paint. */}
          <div className="mt-20 flex w-full flex-col items-center gap-0">
            <div className="w-full max-w-72 cursor-default rounded-xl bg-indigo-950 p-4 text-left shadow-[0_0_20px_-5px_rgba(99,102,241,0.3)] ring-1 ring-indigo-500/50 transition-transform hover:-translate-y-0.5">
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                <span aria-hidden>⚡</span>
                Webhook Trigger
              </p>
              <p className="mt-1 text-xs text-indigo-200/70">Fires on any signed POST to your workflow URL</p>
            </div>

            {DEMO_STEPS.map((step) => (
              <div key={step.label} className="flex w-full flex-col items-center">
                <div aria-hidden className="mx-auto h-8 w-0.5 bg-neutral-700" />
                <div className="w-full max-w-72 cursor-default rounded-xl bg-neutral-900 p-4 text-left ring-1 ring-neutral-700 transition-transform hover:-translate-y-0.5">
                  <p className="flex items-center gap-2 text-sm font-semibold text-white">
                    <span aria-hidden>{step.icon}</span>
                    {step.label}
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Features                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-neutral-950/50 px-6 py-24">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-400">Features</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Everything you need to automate</h2>
          <p className="mx-auto mt-3 max-w-xl text-neutral-400">
            No vendor lock-in. No per-task pricing. Just your code, your data, your server.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-2xl bg-neutral-900 p-8 ring-1 ring-neutral-800 transition-all hover:ring-indigo-500/30"
            >
              <span className={`flex size-10 items-center justify-center rounded-xl p-2 ring-1 ${feature.accent}`}>
                <Icon path={feature.icon} className="size-full" />
              </span>
              <h3 className="mt-5 text-base font-semibold text-white">{feature.title}</h3>
              <p className="mt-2 text-sm text-neutral-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Closing CTA                                                       */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-black px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-white">Ready to automate?</h2>
        <p className="mt-3 text-neutral-400">Deploy FlowState in minutes and start building workflows.</p>
        <div className="mt-8">
          <Link href="/register" className={PRIMARY_BUTTON}>
            Get Started — It&apos;s Free
          </Link>
        </div>
        <p className="mt-16 text-xs text-neutral-600">Built by Akhil Krishna · MIT License</p>
      </section>
    </div>
  );
}
