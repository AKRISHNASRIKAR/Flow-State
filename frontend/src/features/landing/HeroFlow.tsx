'use client';

import { useEffect, useState } from 'react';
import { Connector, FlowNodeCard, type RunTone } from '../../components/flow-visuals';
import { GLYPHS } from '../../lib/glyphs';

// One run of a real FlowState workflow, replayed on a loop. Every node is a
// capability the engine has today: webhook trigger, web request, email,
// Telegram. Durations are illustrative.
const STEPS = [
  { kind: 'trigger' as const, label: 'Trigger · webhook', title: 'The shop sends an order', glyph: GLYPHS.webhook, done: 'received' },
  { kind: 'step' as const, label: 'Step 1 · web request', title: 'Look up order 1042', glyph: GLYPHS.request, done: '41 ms' },
  { kind: 'step' as const, label: 'Step 2 · email', title: 'Email Ada the receipt', glyph: GLYPHS.email, done: '128 ms' },
  { kind: 'step' as const, label: 'Step 3 · Telegram', title: 'Tell the team', glyph: GLYPHS.message, done: '63 ms' },
];

const CAPTIONS = [
  'POST /webhooks/order-alerts · signature ok',
  'GET /orders/{{payload.orderId}} → /orders/1042',
  'to: {{payload.http.body.email}} → ada@lovelace.dev',
  '“New order: 1042 · $129.50”',
  'Run succeeded · 4 steps · 412 ms',
];

// Beats: 0 trigger fires, 1–3 steps run, 4 result, 5 hold.
const BEAT_MS = 1150;
const BEATS = 6;

export function HeroFlow() {
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setBeat(4);
      return;
    }
    const id = window.setInterval(() => {
      if (!document.hidden) setBeat((b) => (b + 1) % BEATS);
    }, BEAT_MS);
    return () => window.clearInterval(id);
  }, []);

  const stateFor = (i: number): { tone: RunTone; text: string } | undefined => {
    if (i === 0) return { tone: 'ok', text: STEPS[0].done };
    if (beat >= i + 1) return { tone: 'ok', text: STEPS[i].done };
    if (beat === i) return { tone: 'running', text: 'running' };
    return { tone: 'idle', text: 'waiting' };
  };
  const finished = beat >= 4;

  return (
    <div className="relative">
      {/* The canvas the nodes sit on — the same drafting-paper ground as the builder. */}
      <div className="grid-paper relative overflow-hidden rounded-md border border-rule px-5 py-7 sm:px-8">
        <div className="mx-auto flex max-w-[340px] flex-col">
          {STEPS.map((step, i) => (
            <div key={step.label}>
              {i > 0 && <Connector height={26} flowing={beat === i} />}
              <FlowNodeCard
                kind={step.kind}
                label={step.label}
                title={step.title}
                glyph={step.glyph}
                state={stateFor(i)}
                active={beat === i && i > 0}
              />
            </div>
          ))}
          <Connector height={26} flowing={beat === 4} drawn={finished ? 1 : 0} />
          <FlowNodeCard
            kind="result"
            label="Result"
            title={finished ? 'Order handled' : 'Waiting for the steps…'}
            glyph={GLYPHS.check}
            state={finished ? { tone: 'ok', text: '412 ms' } : { tone: 'idle', text: '—' }}
            className={finished ? '' : 'opacity-60'}
          />
        </div>
      </div>
      <p
        aria-live="off"
        className="mt-3 truncate rounded-[4px] border border-dashed border-rule bg-card px-3 py-2 font-mono text-[12px] text-muted"
      >
        <span className="text-signal">▸</span> {CAPTIONS[Math.min(beat, 4)]}
      </p>
    </div>
  );
}
