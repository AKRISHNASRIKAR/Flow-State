'use client';

import type { CSSProperties, ReactNode } from 'react';
import { StateChip } from '../../components/flow-visuals';
import { SectionHead } from './Spine';
import { useScrollProgress } from './useScrollProgress';

// The same six moves as the builder's setup checklist, so the landing page is
// literally teaching the app.
const MOVES: { title: string; body: string; ui: ReactNode }[] = [
  {
    title: 'Say what you want',
    body: 'Name the job in plain words.',
    ui: <span className="font-serif text-[15px] italic text-ink">“Email every new order’s receipt”</span>,
  },
  {
    title: 'Choose a trigger',
    body: 'Webhook, schedule, or a button.',
    ui: <span className="font-mono text-[11px] text-ink">⚡ webhook · /webhooks/…</span>,
  },
  {
    title: 'Add the steps',
    body: 'In the order they should run.',
    ui: <span className="font-mono text-[11px] text-ink">→ request · ✉ email · ✈ Telegram</span>,
  },
  {
    title: 'Pass data along',
    body: 'Templates fill each step in.',
    ui: <span className="rounded-[3px] bg-signal-soft px-1 font-mono text-[11px] text-signal">{'{{payload.orderId}}'}</span>,
  },
  {
    title: 'Run it',
    body: 'Try it with sample data first.',
    ui: <StateChip tone="running">running</StateChip>,
  },
  {
    title: 'Watch it',
    body: 'Every step’s result, kept.',
    ui: <StateChip tone="ok">succeeded · 412 ms</StateChip>,
  },
];

export function IdeaToFlow() {
  const ref = useScrollProgress<HTMLElement>();
  return (
    <section ref={ref} className="relative py-28 lg:py-36" style={{ '--p': 0 } as CSSProperties}>
      <SectionHead n="09" stage="From idea to automation" title="Six moves from “I wish this ran itself” to a flow.">
        <p>No code, and nothing the engine can’t do. These are the exact steps the builder walks you through.</p>
      </SectionHead>

      <ol className="relative mt-16 grid grid-cols-[minmax(0,1fr)] gap-6 pl-[64px] sm:grid-cols-2 lg:grid-cols-6 lg:gap-4 lg:pl-[88px]">
        {/* The line that joins the moves — drawn across as you scroll (down, on phones). */}
        <span
          aria-hidden
          className="sp sp-draw-x absolute left-[88px] right-0 top-[15px] hidden h-px bg-ink/60 lg:block"
          style={{ '--a': 0.3, '--span': 0.25 } as CSSProperties}
        />
        {MOVES.map((m, i) => (
          <li
            key={m.title}
            className="sp sp-reveal relative"
            style={{ '--a': 0.3 + i * 0.04, '--span': 0.06 } as CSSProperties}
          >
            <span className="relative z-10 flex h-[30px] w-[30px] items-center justify-center rounded-full border border-ink bg-paper font-mono text-[12px] text-ink">
              {i + 1}
            </span>
            <p className="mt-4 text-[15px] font-semibold text-ink">{m.title}</p>
            <p className="mt-1 text-[14px] leading-snug text-muted">{m.body}</p>
            <div className="mt-3 flex min-h-[40px] items-center rounded-[4px] border border-rule bg-card px-2.5 py-2">{m.ui}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
