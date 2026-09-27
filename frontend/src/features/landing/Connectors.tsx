'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/ui';
import { GLYPHS } from '../../lib/glyphs';
import { SectionHead } from './Spine';
import { useScrollProgress } from './useScrollProgress';

// Only what FlowState can connect to today, plus the one integration its
// roadmap commits to next (Google — sign-in already uses it). Anything else
// would be a promise the engine can't keep.
const INPUTS = [
  { id: 'in-webhook', title: 'Any app that can send a webhook', sub: 'GitHub · Stripe · Shopify · your own backend', glyph: GLYPHS.webhook },
  { id: 'in-schedule', title: 'Any URL, checked on a schedule', sub: 'Fires when the response changes · every 30 s or more', glyph: GLYPHS.schedule },
  { id: 'in-manual', title: 'You, pressing Test run', sub: 'With whatever sample data you choose', glyph: GLYPHS.manual },
];

const OUTPUTS = [
  { id: 'out-http', title: 'Any REST API', sub: 'GET, POST, PUT… with headers and a body', glyph: GLYPHS.request },
  { id: 'out-email', title: 'Email', sub: 'Sent through Resend', glyph: GLYPHS.email },
  { id: 'out-telegram', title: 'Telegram', sub: 'Messages to any chat', glyph: GLYPHS.message },
  { id: 'out-google', title: 'Gmail · Sheets · Calendar', sub: 'Coming next — on the same Google sign-in', glyph: GLYPHS.table, soon: true },
];

type Wire = { id: string; d: string; soon?: boolean; order: number };

function Tile({ id, title, sub, glyph, soon }: { id: string; title: string; sub: string; glyph: string; soon?: boolean }) {
  return (
    <div
      data-wire={id}
      className={`flex items-start gap-3 rounded-md px-3.5 py-3 ${
        soon ? 'border border-dashed border-faint/70' : 'border border-rule bg-card shadow-[0_10px_24px_-20px_rgba(15,27,45,0.5)]'
      }`}
    >
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-[4px] ${soon ? 'text-faint' : 'bg-paper-2 text-ink'}`}>
        <Icon path={glyph} className="size-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0">
        <span className={`block text-[15px] font-medium ${soon ? 'text-muted' : 'text-ink'}`}>{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted">{sub}</span>
      </span>
    </div>
  );
}

export function Connectors() {
  const ref = useScrollProgress<HTMLElement>();
  const boardRef = useRef<HTMLDivElement>(null);
  const [wires, setWires] = useState<Wire[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // Wires are measured from the rendered tiles, so they meet each tile and
  // the core exactly at every width (the layout stacks on phones).
  const measure = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const b = board.getBoundingClientRect();
    const core = board.querySelector<HTMLElement>('[data-core]')?.getBoundingClientRect();
    if (!core) return;
    const cy = core.top - b.top + core.height / 2;
    const stacked = window.innerWidth < 1024;
    const next: Wire[] = [];
    board.querySelectorAll<HTMLElement>('[data-wire]').forEach((el, order) => {
      const r = el.getBoundingClientRect();
      const id = el.dataset.wire ?? '';
      const isInput = id.startsWith('in-');
      let x: number, y: number, tx: number, ty: number, d: string;
      if (stacked) {
        // Wires run down the left edge into the core.
        x = r.left - b.left;
        y = r.top - b.top + r.height / 2;
        tx = core.left - b.left;
        ty = cy;
        const bend = -28;
        d = `M ${x} ${y} C ${x + bend} ${y}, ${tx + bend} ${ty}, ${tx} ${ty}`;
      } else {
        x = isInput ? r.right - b.left : r.left - b.left;
        y = r.top - b.top + r.height / 2;
        tx = isInput ? core.left - b.left : core.right - b.left;
        ty = cy;
        const mid = (x + tx) / 2;
        d = `M ${x} ${y} C ${mid} ${y}, ${mid} ${ty}, ${tx} ${ty}`;
      }
      next.push({ id, d, order, soon: el.className.includes('border-dashed') });
    });
    setBox({ w: b.width, h: b.height });
    setWires(next);
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (boardRef.current) ro.observe(boardRef.current);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <section id="connectors" ref={ref} className="relative scroll-mt-20 py-28 lg:py-36" style={{ '--p': 0 } as CSSProperties}>
      <SectionHead n="08" stage="Connectors" title="Plugged into what you already use.">
        <p>A workflow starts from something outside FlowState and reaches back out when it runs. Here is everything it connects to today — and what’s next.</p>
      </SectionHead>

      <div ref={boardRef} className="relative mt-16 pl-[64px] lg:pl-[88px]">
        <svg aria-hidden className="pointer-events-none absolute inset-0 overflow-visible" width={box.w} height={box.h}>
          {wires.map((w) => (
            <path
              key={w.id}
              d={w.d}
              pathLength={1}
              fill="none"
              className="sp"
              stroke={w.soon ? 'var(--color-faint)' : 'var(--color-ink)'}
              strokeOpacity={w.soon ? 0.6 : 0.55}
              strokeWidth={1.25}
              strokeDasharray={w.soon ? '0.012 0.012' : '1 1'}
              style={
                {
                  '--a': 0.25 + w.order * 0.03,
                  '--span': 0.12,
                  strokeDashoffset: w.soon ? 0 : 'calc(1 - var(--t))',
                  opacity: w.soon ? 'var(--t)' : 1,
                } as CSSProperties
              }
            />
          ))}
        </svg>

        <div className="relative grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_220px_minmax(0,1fr)] lg:items-center lg:gap-16">
          <div className="grid gap-3 pl-8 lg:pl-0">
            <p className="label-caps text-muted">Starts a workflow</p>
            {INPUTS.map((t) => (
              <Tile key={t.id} {...t} />
            ))}
          </div>

          <div data-core className="order-first mx-auto w-full max-w-[220px] rounded-md bg-ink p-5 text-paper shadow-[0_24px_50px_-26px_rgba(15,27,45,0.8)] lg:order-none">
            <p className="label-caps text-paper/60">Engine</p>
            <p className="mt-2 font-serif text-[28px] leading-none">FlowState</p>
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-paper/70">
              verify · dedupe · admit
              <br />
              run each step · retry
              <br />
              record every result
            </p>
          </div>

          <div className="grid gap-3 pl-8 lg:pl-0">
            <p className="label-caps text-muted">Steps reach out to</p>
            {OUTPUTS.map((t) => (
              <Tile key={t.id} {...t} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
