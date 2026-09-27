'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Connector, FlowNodeCard, StateChip, type RunTone } from '../../components/flow-visuals';
import { GLYPHS } from '../../lib/glyphs';
import { Station } from './Spine';
import { useScrollProgress } from './useScrollProgress';

/*
 * The scroll story. Five chapters scroll on the left; on the right a sticky
 * stage builds ONE real workflow as you read — trigger, then steps, then the
 * wiring between them, then a run, then its record. Story progress p (0..1)
 * is split into five equal windows, one per chapter:
 *
 *   0.0–0.2 Trigger   0.2–0.4 Steps   0.4–0.6 Logic   0.6–0.8 Execution   0.8–1 Result
 */

const CHAPTERS = [
  {
    n: '02',
    stage: 'Trigger',
    title: 'It starts when something happens.',
    body: 'Your shop sends each new order to the workflow’s own URL. It could just as well be a URL FlowState checks on a schedule, or you pressing Test run.',
    note: 'Requests are signed, so forged ones are rejected. A delivery sent twice runs once.',
  },
  {
    n: '03',
    stage: 'Flow · actions',
    title: 'Then the steps run, in order.',
    body: 'Look up the order. Email the customer their receipt. Tell the team on Telegram. Each step is a node, and the line between them is the order they run in.',
    note: 'Web requests, email, Telegram messages, waits and log lines.',
  },
  {
    n: '04',
    stage: 'Logic',
    title: 'Each step uses what the last one found.',
    body: 'The order id from the webhook completes the lookup URL. The lookup’s answer — the customer’s name and email — completes the receipt. Templates are the wiring.',
    note: '{{payload.orderId}} · {{payload.http.body.email}}',
  },
  {
    n: '05',
    stage: 'Execution',
    title: 'Every run is durable, one step at a time.',
    body: 'If the email service hiccups, only that step is retried, with a growing pause between attempts. The order lookup that already worked isn’t repeated.',
    note: 'Three attempts per step · 2 s, then 4 s back-off.',
  },
  {
    n: '06',
    stage: 'Result · observability',
    title: 'And you can see exactly what happened.',
    body: 'Every run keeps each step’s input, output, duration and attempts. When something fails you know which step, what it received, and what it said back.',
    note: 'Queued · running · succeeded · failed — per run, and per step.',
  },
] as const;

type Exec = { tones: RunTone[]; texts: string[]; flowing: number };

// Execution replay, driven by scroll inside the 0.6–0.8 window.
function execAt(p: number): Exec {
  const idle: Exec = { tones: ['idle', 'idle', 'idle', 'idle'], texts: ['', '', '', ''], flowing: -1 };
  if (p < 0.6) return idle;
  const beats: Exec[] = [
    { tones: ['ok', 'running', 'idle', 'idle'], texts: ['received', 'running', 'queued', 'queued'], flowing: 0 },
    { tones: ['ok', 'ok', 'running', 'idle'], texts: ['received', '41 ms', 'running', 'queued'], flowing: 1 },
    { tones: ['ok', 'ok', 'fail', 'idle'], texts: ['received', '41 ms', 'timed out · 1 of 3', 'queued'], flowing: -1 },
    { tones: ['ok', 'ok', 'retry', 'idle'], texts: ['received', '41 ms', 'retrying · 2 of 3', 'queued'], flowing: 1 },
    { tones: ['ok', 'ok', 'ok', 'running'], texts: ['received', '41 ms', '128 ms · 2nd try', 'running'], flowing: 2 },
    { tones: ['ok', 'ok', 'ok', 'ok'], texts: ['received', '41 ms', '128 ms · 2nd try', '63 ms'], flowing: -1 },
  ];
  const i = Math.min(beats.length - 1, Math.floor((p - 0.6) / (0.2 / beats.length)));
  return beats[i];
}

/** Appears when story progress reaches `a`. */
const at = (a: number, span = 0.05, extra: CSSProperties = {}) => ({ '--a': a, '--span': span, ...extra }) as CSSProperties;

function Token({ a, children }: { a: number; children: ReactNode }) {
  return (
    <span
      className="sp sp-lit rounded-[3px] border bg-card px-1 font-mono text-[12px]"
      style={{ ...at(a, 0.04), backgroundColor: 'color-mix(in oklab, var(--color-signal-soft) calc(var(--t) * 100%), var(--color-card))' }}
    >
      {children}
    </span>
  );
}

function Stage({ exec }: { exec: Exec }) {
  const chip = (i: number) =>
    exec.tones[i] === 'idle' && !exec.texts[i] ? undefined : { tone: exec.tones[i], text: exec.texts[i] || 'queued' };

  return (
    <div className="grid-paper relative h-full overflow-hidden rounded-md border border-rule">
      <div className="absolute left-4 top-3 flex items-center gap-2">
        <span className="label-caps text-muted">Order alerts</span>
        <span className="sp" style={at(0.6, 0.02)}>
          <StateChip tone="running" className="sp-reveal">live run</StateChip>
        </span>
      </div>

      {/* Stage content is laid out at desktop size and scaled down on small screens. */}
      <div className="absolute inset-x-0 top-10 bottom-0 flex justify-center xl:justify-start xl:pl-6">
        <div className="w-[340px] origin-top scale-[0.72] sm:scale-[0.85] lg:scale-100 xl:w-[320px]">
          {/* Trigger — and the three kinds it could be */}
          <div className="relative">
          <div className="sp sp-reveal" style={at(0.0, 0.03)}>
            <FlowNodeCard
              kind="trigger"
              label="Trigger · webhook"
              title="The shop sends an order"
              glyph={GLYPHS.webhook}
              state={chip(0)}
            />
          </div>
          <div className="sp sp-fade-out absolute inset-x-0 top-full z-10 mt-2 flex justify-between gap-2" style={at(0.17, 0.04)}>
            {[
              { label: 'Webhook', glyph: GLYPHS.webhook, on: true },
              { label: 'Schedule', glyph: GLYPHS.schedule, on: false },
              { label: 'Test run', glyph: GLYPHS.manual, on: false },
            ].map((t, i) => (
              <span
                key={t.label}
                className="sp sp-reveal flex flex-1 items-center justify-center gap-1.5 rounded-[4px] border px-2 py-1.5 font-mono text-[11px]"
                style={{
                  ...at(0.04 + i * 0.025, 0.04),
                  borderColor: t.on ? 'var(--color-ink)' : 'var(--color-rule)',
                  color: t.on ? 'var(--color-ink)' : 'var(--color-muted)',
                  background: 'var(--color-card)',
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="size-3.5" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d={t.glyph} />
                </svg>
                {t.label}
              </span>
            ))}
          </div>
          </div>

          {/* Steps — each connection draws itself, then its node arrives */}
          {[
            {
              a: 0.21,
              node: (
                <FlowNodeCard
                  kind="step"
                  label="Step 1 · web request"
                  glyph={GLYPHS.request}
                  state={chip(1)}
                  active={exec.tones[1] === 'running'}
                  title="Look up the order"
                >
                  <p className="mt-2 truncate pl-11 font-mono text-[12px] text-muted">
                    GET /orders/<Token a={0.43}>{'{{payload.orderId}}'}</Token>
                  </p>
                </FlowNodeCard>
              ),
            },
            {
              a: 0.27,
              node: (
                <FlowNodeCard
                  kind="step"
                  label="Step 2 · email"
                  glyph={GLYPHS.email}
                  state={chip(2)}
                  active={exec.tones[2] === 'running'}
                  alert={exec.tones[2] === 'fail'}
                  title="Email the receipt"
                >
                  <p className="mt-2 truncate pl-11 font-mono text-[12px] text-muted">
                    to <Token a={0.5}>{'{{payload.http.body.email}}'}</Token>
                  </p>
                </FlowNodeCard>
              ),
            },
            {
              a: 0.33,
              node: (
                <FlowNodeCard
                  kind="step"
                  label="Step 3 · Telegram"
                  glyph={GLYPHS.message}
                  state={chip(3)}
                  active={exec.tones[3] === 'running'}
                  title="Tell the team"
                />
              ),
            },
          ].map((s, i) => (
            <div key={i}>
              <div className="sp sp-draw-y" style={at(s.a - 0.03, 0.03)}>
                <Connector height={24} flowing={exec.flowing === i} />
              </div>
              <div className="sp sp-reveal" style={at(s.a, 0.04)}>
                {s.node}
              </div>
            </div>
          ))}

          {/* Result */}
          <div className="sp sp-draw-y" style={at(0.8, 0.03)}>
            <Connector height={24} />
          </div>
          <div className="sp sp-reveal" style={at(0.82, 0.04)}>
            <FlowNodeCard
              kind="result"
              label="Result"
              title="Order handled"
              glyph={GLYPHS.check}
              state={{ tone: 'ok', text: '4 steps · 412 ms' }}
            />
          </div>
        </div>
      </div>

      {/* Logic: the data flowing between steps */}
      <div
        className="sp sp-reveal absolute right-4 top-[150px] hidden w-[250px] rounded-[4px] border border-rule bg-card p-2.5 font-mono text-[11px] leading-relaxed text-muted shadow-[0_10px_24px_-18px_rgba(15,27,45,0.5)] xl:block"
        style={at(0.42, 0.04, { '--dx': '16px' } as CSSProperties)}
      >
        <p className="label-caps mb-1.5 text-faint">payload</p>
        <p>
          orderId: <span className="text-ink">1042</span>
        </p>
        <p className="sp sp-reveal" style={at(0.5, 0.04)}>
          http.body.email: <span className="text-ink">ada@lovelace.dev</span>
        </p>
        <p className="sp sp-reveal" style={at(0.53, 0.04)}>
          http.body.total: <span className="text-ink">129.50</span>
        </p>
      </div>

      {/* Observability: the run's record */}
      <div
        className="sp sp-reveal absolute bottom-4 right-4 hidden w-[260px] rounded-[4px] border border-rule bg-card shadow-[0_14px_30px_-20px_rgba(15,27,45,0.5)] xl:block"
        style={at(0.86, 0.05)}
      >
        <div className="flex items-center justify-between border-b border-rule-soft px-3 py-2">
          <span className="label-caps text-muted">Run 7f3a</span>
          <StateChip tone="ok">succeeded</StateChip>
        </div>
        {[
          { step: '1 · web request', v: '200 · 41 ms', a: 0.88 },
          { step: '2 · email', v: 'attempt 2 · 128 ms', a: 0.9, retry: true },
          { step: '3 · Telegram', v: 'sent · 63 ms', a: 0.92 },
        ].map((r) => (
          <p
            key={r.step}
            className="sp sp-reveal flex justify-between gap-2 px-3 py-1.5 font-mono text-[11px] text-graphite"
            style={at(r.a, 0.03)}
          >
            <span>{r.step}</span>
            <span className={r.retry ? 'text-wait' : 'text-ok'}>{r.v}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

export function StoryPipeline() {
  const [exec, setExec] = useState<Exec>(() => execAt(0));
  const lastKey = useRef('');
  const ref = useScrollProgress<HTMLElement>({
    mode: 'pinned',
    start: 0.2,
    end: 0.8,
    onChange: (p) => {
      const next = execAt(p);
      const key = next.texts.join('|') + next.flowing;
      if (key !== lastKey.current) {
        lastKey.current = key;
        setExec(next);
      }
    },
  });

  return (
    <section id="story" ref={ref} className="relative scroll-mt-20" style={{ '--p': 0 } as CSSProperties}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] xl:grid-cols-[minmax(0,1fr)_620px]">
        {/* Sticky stage: first in the DOM so it pins above the text on phones. */}
        <div className="sticky top-14 z-20 h-[46vh] bg-paper pb-3 lg:order-2 lg:top-24 lg:h-[min(76vh,700px)] lg:pb-0">
          <Stage exec={exec} />
        </div>

        <div className="lg:order-1">
          {CHAPTERS.map((c, i) => (
            <article key={c.n} className="relative flex min-h-[78vh] items-center pl-[64px] lg:min-h-[92vh] lg:pl-[88px]">
              <div className="sp sp-reveal relative" style={at(i * 0.2 - 0.05, 0.07)}>
                {/* Back out of the text indent so the station sits on the spine. */}
                <span className="absolute -left-[64px] top-0 lg:-left-[88px]">
                  <Station n={c.n} />
                </span>
                <p className="label-caps pt-[7px] text-signal">{c.stage}</p>
                <h3 className="mt-4 max-w-[16ch] font-serif text-[34px] leading-[1.06] tracking-[-0.01em] text-ink sm:text-[44px]">
                  {c.title}
                </h3>
                <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-graphite">{c.body}</p>
                <p className="mt-5 max-w-[46ch] border-l-2 border-rule pl-3 font-mono text-[12.5px] leading-relaxed text-muted">
                  {c.note}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
