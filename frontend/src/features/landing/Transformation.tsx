'use client';

import type { CSSProperties } from 'react';
import { useRef, useState } from 'react';
import { Connector, FlowNodeCard } from '../../components/flow-visuals';
import { GLYPHS } from '../../lib/glyphs';
import { SectionHead } from './Spine';
import { useScrollProgress } from './useScrollProgress';

// What handling one shop order looks like by hand — the job the workflow in
// the story above replaces.
const MANUAL = [
  'Notice the new-order email',
  'Copy the order number',
  'Look the order up in the shop admin',
  'Copy the customer’s email address',
  'Write the receipt',
  'Send it',
  'Open the team chat',
  'Post “new order” with the total',
];

// Which automated step absorbs each manual one (index into FLOW).
const ABSORBED_BY = [0, 0, 1, 1, 2, 2, 3, 3];

const FLOW = [
  { kind: 'trigger' as const, label: 'Trigger · webhook', title: 'The shop sends an order', glyph: GLYPHS.webhook },
  { kind: 'step' as const, label: 'Step 1 · web request', title: 'Look up the order', glyph: GLYPHS.request },
  { kind: 'step' as const, label: 'Step 2 · email', title: 'Email the receipt', glyph: GLYPHS.email },
  { kind: 'step' as const, label: 'Step 3 · Telegram', title: 'Tell the team', glyph: GLYPHS.message },
];

// Section progress where the first manual step is struck, and the gap between strikes.
const FIRST = 0.28;
const EACH = 0.035;

const at = (a: number, span = 0.05, extra: CSSProperties = {}) => ({ '--a': a, '--span': span, ...extra }) as CSSProperties;

export function Transformation() {
  const [left, setLeft] = useState(MANUAL.length);
  const last = useRef(MANUAL.length);
  const ref = useScrollProgress<HTMLElement>({
    onChange: (p) => {
      const struck = Math.max(0, Math.min(MANUAL.length, Math.floor((p - FIRST) / EACH) + 1));
      const remaining = MANUAL.length - struck;
      if (remaining !== last.current) {
        last.current = remaining;
        setLeft(remaining);
      }
    },
  });

  return (
    <section ref={ref} className="relative py-28 lg:py-40" style={{ '--p': 0 } as CSSProperties}>
      <SectionHead n="07" stage="Automation" title="Eight steps by hand become one flow.">
        <p>The same order, handled the way most teams do it today — and the workflow that replaces it. Scroll, and watch each manual step fold into the node that now does it.</p>
      </SectionHead>

      <div className="mt-16 grid grid-cols-[minmax(0,1fr)] items-start gap-10 pl-[64px] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-8 lg:pl-[88px]">
        {/* By hand */}
        <div>
          <p className="label-caps text-muted">By hand · every order</p>
          <ol className="mt-4 divide-y divide-rule-soft border-y border-rule-soft">
            {MANUAL.map((step, i) => {
              const a = FIRST + i * EACH;
              return (
                <li key={step} className="sp relative flex items-center gap-4 py-2.5" style={at(a, 0.03)}>
                  <span className="w-6 font-mono text-[12px] text-faint tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-[15px] text-graphite" style={{ opacity: "calc(1 - var(--t) * 0.6)" }}>
                    {step}
                  </span>
                  <span aria-hidden className="sp-draw-x absolute left-10 right-3 top-1/2 h-px bg-ink/50 sm:right-24" />
                  <span
                    className="ml-auto hidden shrink-0 font-mono text-[11px] text-signal sm:inline"
                    style={{ opacity: 'var(--t)' }}
                  >
                    → {FLOW[ABSORBED_BY[i]].label.split(' · ')[0].toLowerCase()}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* The counter between the two */}
        <div className="flex items-center gap-4 lg:flex-col lg:self-center lg:pt-10">
          <div className="rounded-md border border-rule bg-card px-5 py-4 text-center">
            <p className="label-caps text-muted">Manual steps</p>
            <p className={`mt-2 font-serif text-[56px] leading-none tabular-nums ${left === 0 ? 'text-ok' : 'text-ink'}`}>{left}</p>
          </div>
          <svg viewBox="0 0 60 12" className="hidden h-3 w-16 text-rule lg:block" aria-hidden>
            <path d="M0 6h54M48 1l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>

        {/* With FlowState */}
        <div>
          <p className="label-caps text-signal">With FlowState · once</p>
          <div className="mt-4 max-w-[340px]">
            {FLOW.map((n, i) => (
              <div key={n.label}>
                {i > 0 && (
                  <div className="sp sp-draw-y" style={at(FIRST + (i * 2 - 1) * EACH, 0.04)}>
                    <Connector height={20} />
                  </div>
                )}
                <div className="sp sp-reveal" style={at(FIRST + i * 2 * EACH - 0.02, 0.05)}>
                  <FlowNodeCard kind={n.kind} label={n.label} title={n.title} glyph={n.glyph} />
                </div>
              </div>
            ))}
            <div className="sp sp-draw-y" style={at(FIRST + 8 * EACH, 0.03)}>
              <Connector height={20} />
            </div>
            <div className="sp sp-reveal" style={at(FIRST + 8 * EACH + 0.02, 0.04)}>
              <FlowNodeCard kind="result" label="Result" title="Handled — while you did something else" glyph={GLYPHS.check} state={{ tone: 'ok', text: 'automated' }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
