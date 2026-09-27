'use client';

import type { CSSProperties } from 'react';
import { Connector, FlowNodeCard, StateChip } from '../../components/flow-visuals';
import { GLYPHS } from '../../lib/glyphs';
import { SectionHead } from './Spine';
import { useScrollProgress } from './useScrollProgress';

const at = (a: number, span = 0.08) => ({ '--a': a, '--span': span }) as CSSProperties;

/**
 * The hand-off from concept to product: the same nodes the page has been
 * building sit at the centre, and the builder's chrome — top bar, inspector,
 * run dock — assembles around them as the frame settles to full size.
 */
export function ProductShowcase() {
  const ref = useScrollProgress<HTMLElement>();

  return (
    <section id="product" ref={ref} className="relative scroll-mt-20 py-28 lg:py-36" style={{ '--p': 0 } as CSSProperties}>
      <SectionHead n="10" stage="The product" title="This is where you build it.">
        <p>Everything above, in one place: the flow in the middle, the selected step on the right, and the last run along the bottom. You always know where you are, whether the workflow is ready, and what it did last time.</p>
      </SectionHead>

      <div className="mt-16 pl-[64px] lg:pl-[88px]">
        <div
          className="sp origin-top overflow-hidden rounded-md border border-rule bg-card shadow-[0_40px_80px_-50px_rgba(15,27,45,0.55)]"
          style={{ ...at(0.18, 0.28), transform: 'scale(calc(0.9 + var(--t) * 0.1))' }}
        >
          {/* Top bar */}
          <div className="sp sp-reveal flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-4 py-3" style={at(0.28)}>
            <span className="text-[13px] text-muted">Workflows /</span>
            <span className="font-serif text-[22px] leading-none text-ink">Order alerts</span>
            <StateChip tone="ok">● on</StateChip>
            <span className="rounded-[3px] bg-signal-soft px-1.5 py-1 font-mono text-[11px] font-medium text-signal">✓ ready to run</span>
            <span className="ml-auto hidden font-mono text-[11px] text-muted sm:inline">last run 2 min ago · succeeded</span>
            <span className="rounded-[5px] bg-ink px-3 py-1.5 text-[13px] font-medium text-paper">▶ Test run</span>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
            {/* Canvas */}
            <div className="grid-paper flex justify-center px-4 py-8">
              <div className="w-full max-w-[320px]">
                <FlowNodeCard kind="trigger" label="Trigger · webhook" title="The shop sends an order" glyph={GLYPHS.webhook} state={{ tone: 'ok', text: '3 today' }} />
                <Connector height={22} />
                <FlowNodeCard kind="step" label="Step 1 · web request" title="Look up the order" glyph={GLYPHS.request} state={{ tone: 'ok', text: '41 ms' }} active />
                <Connector height={22} />
                <FlowNodeCard kind="step" label="Step 2 · email" title="Email the receipt" glyph={GLYPHS.email} state={{ tone: 'retry', text: '2nd try' }} />
                <Connector height={22} />
                <FlowNodeCard kind="step" label="Step 3 · Telegram" title="Tell the team" glyph={GLYPHS.message} state={{ tone: 'ok', text: '63 ms' }} />
                <Connector height={22} />
                <div className="rounded-md border border-dashed border-faint/70 py-2.5 text-center text-[13px] font-medium text-muted">+ Add a step</div>
              </div>
            </div>

            {/* Inspector */}
            <aside className="sp sp-reveal-x hidden border-l border-rule p-4 lg:block" style={{ ...at(0.36), '--dx': '24px' } as CSSProperties}>
              <p className="label-caps text-muted">Selected step</p>
              <p className="mt-2 text-[15px] font-semibold text-ink">Step 1 · Look up the order</p>
              {[
                ['Method', 'GET'],
                ['URL', 'https://shop.example/orders/{{payload.orderId}}'],
                ['Uses', 'payload.orderId · payload.source'],
                ['Last result', '200 · 41 ms'],
              ].map(([k, v]) => (
                <div key={k} className="mt-3">
                  <p className="label-caps text-faint">{k}</p>
                  <p className="mt-1 break-words rounded-[4px] border border-rule bg-paper px-2 py-1.5 font-mono text-[12px] text-ink">{v}</p>
                </div>
              ))}
            </aside>
          </div>

          {/* Run dock */}
          <div className="sp sp-reveal grid grid-cols-2 border-t border-rule sm:grid-cols-4" style={at(0.44)}>
            {[
              ['Status', 'On · webhook'],
              ['Last run', 'Succeeded · 412 ms'],
              ['Runs today', '3 · 0 failed'],
              ['Deliveries', '4 received · 1 duplicate'],
            ].map(([k, v], i) => (
              <div key={k} className={`px-4 py-3 ${i > 0 ? 'border-l border-rule-soft' : ''}`}>
                <p className="label-caps text-muted">{k}</p>
                <p className={`mt-1.5 text-[14px] font-medium tabular-nums ${k === 'Last run' ? 'text-ok' : 'text-ink'}`}>{v}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-4 font-mono text-[12px] text-muted">The builder, as it looks after you sign in. The numbers are an example.</p>
      </div>
    </section>
  );
}
