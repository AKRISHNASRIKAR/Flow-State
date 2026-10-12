'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useScrollProgress } from '../../features/landing/useScrollProgress';
import { ThemeControl } from '../../components/ThemeControl';
import { BrandLockup } from '../../components/Logo';
import { Connector, FlowNodeCard, StateChip } from '../../components/flow-visuals';
import { Button, Icon, ICON_PATHS } from '../../components/ui';
import { GLYPHS } from '../../lib/glyphs';

const GITHUB_URL = 'https://github.com/AKRISHNASRIKAR/Flow-State';
const CTA = 'inline-flex items-center justify-center gap-3 rounded-md bg-ink px-5 py-3 text-sm font-medium text-paper transition-colors hover:bg-graphite focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';
// Each step stays active long enough to read; the handoff gets its own beat.
const STEP_DURATION_MS = 1400;
const HANDOFF_DURATION_MS = 450;
const SHELL = 'mx-auto w-full max-w-[1160px] px-6 sm:px-10';

interface Example {
  name: string;
  description: string;
  trigger: string;
  triggerType: string;
  glyph: string;
  steps: string[];
  stepGlyphs: string[];
  payload: string;
}

const EXAMPLES: Example[] = [
  { name: 'Order updates', description: 'An order comes in. Look up the details, email a receipt, and keep the team in the loop.', trigger: 'A new order arrives', triggerType: 'Webhook', glyph: GLYPHS.webhook, steps: ['Look up the order', 'Email the receipt', 'Notify the team on Telegram'], stepGlyphs: [GLYPHS.request, GLYPHS.email, GLYPHS.message], payload: '{ "orderId": "1042", "email": "alex@example.com" }' },
  { name: 'Change alerts', description: 'Poll an API on a schedule. When its data changes, send the update to your Telegram chat.', trigger: 'API data changes', triggerType: 'Scheduled polling', glyph: GLYPHS.schedule, steps: ['Fetch the latest details', 'Send a Telegram alert', 'Log the update'], stepGlyphs: [GLYPHS.request, GLYPHS.message, GLYPHS.log], payload: '{ "source": "inventory", "changed": true }' },
  { name: 'On-demand tasks', description: 'Start a repeatable task yourself. Call an API, give it time to settle, and record the result.', trigger: 'You start a run', triggerType: 'Manual', glyph: GLYPHS.manual, steps: ['Call your API', 'Wait before continuing', 'Write a log message'], stepGlyphs: [GLYPHS.request, GLYPHS.wait, GLYPHS.log], payload: '{ "task": "refresh-report", "requestedBy": "alex" }' },
];

function Reveal({ children }: { children: ReactNode }) {
  const ref = useScrollProgress<HTMLDivElement>();
  return <div ref={ref} className="sp sp-reveal" style={{ '--a': 0.04, '--span': 0.16 } as CSSProperties}>{children}</div>;
}

function WorkflowDemo() {
  const [selected, setSelected] = useState(0);
  const [phase, setPhase] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const ran = phase >= 7;
  useEffect(() => {
    if (!playing) return;
    if (phase >= 7) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setPhase((current) => current + 1), phase % 2 === 0 ? STEP_DURATION_MS : HANDOFF_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [phase, playing]);
  const example = EXAMPLES[selected];
  return (
    <div className="mt-12 overflow-hidden rounded-md border border-rule bg-card">
      <div className="flex flex-wrap gap-2 border-b border-rule px-4 py-3 sm:px-6" role="group" aria-label="Example workflows">
        {EXAMPLES.map((item, index) => <Button key={item.name} variant={selected === index ? 'primary' : 'ghost'} aria-pressed={selected === index} onClick={() => { setSelected(index); setPhase(-1); setPlaying(false); }}>{item.name}</Button>)}
        <span className="ml-auto self-center font-mono text-[10px] uppercase tracking-widest text-muted">Interactive example</span>
      </div>
      <div key={selected} className="landing-example-enter grid md:grid-cols-[1fr_0.85fr]">
        <div className="grid-paper flex justify-center p-6 sm:p-10">
          <div className="w-full max-w-[350px]">
            <FlowNodeCard kind="trigger" label={`Trigger · ${example.triggerType}`} title={example.trigger} glyph={example.glyph} active={playing && phase === 0} state={phase > 0 ? { tone: 'ok', text: 'Received' } : playing ? { tone: 'running', text: 'Running' } : undefined} />
            {example.steps.map((step, index) => <div key={`${selected}-${step}`}><div className="landing-transfer" style={{ '--handoff-duration': `${HANDOFF_DURATION_MS}ms` } as CSSProperties}><Connector height={30} flowing={playing && phase === index * 2 + 1} drawn={phase > index * 2 ? 1 : 0} /></div><div className={playing && phase === index * 2 + 2 ? 'landing-node-active' : ''}><FlowNodeCard kind="step" label={`Step 0${index + 1}`} title={step} glyph={example.stepGlyphs[index]} active={playing && phase === index * 2 + 2} state={phase > index * 2 + 2 ? { tone: 'ok', text: 'Succeeded' } : playing && phase === index * 2 + 2 ? { tone: 'running', text: 'Running' } : { tone: 'idle', text: 'Waiting' }} /></div></div>)}
          </div>
        </div>
        <div className="flex flex-col justify-center border-t border-rule p-6 sm:p-10 md:border-l md:border-t-0">
          <p className="label-caps text-muted">One event. A whole sequence.</p>
          <h3 className="mt-5 font-serif text-3xl">{example.name}, on autopilot.</h3>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">{example.description}</p>
          <p className="label-caps mt-8 text-muted">Example input</p>
          <code className="mt-3 block break-words rounded-[3px] border border-rule bg-paper p-4 text-xs leading-relaxed text-graphite">{example.payload}</code>
          <div className="mt-6"><Button disabled={playing} onClick={() => { setPhase(0); setPlaying(true); }} variant="primary"><Icon path={ICON_PATHS.play} className="size-4" />{playing ? 'Running example…' : ran ? 'Replay example' : 'Play example run'}</Button></div>
          <p role="status" className="mt-4 text-xs leading-relaxed text-muted">{playing ? `Following the flow · ${phase === 0 ? 'Receiving the trigger' : phase % 2 === 1 ? 'Passing data to the next step' : example.steps[phase / 2 - 1]}.` : ran ? 'Example complete. All three steps succeeded, in order. No external requests were sent.' : 'A local illustration of a run. Your real workflows record each step’s input, output, and status.'}</p>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menuOpen]);
  return (
    <div className="landing-page min-h-screen bg-paper">
      <header className="relative z-20 border-b border-rule bg-paper">
        <nav aria-label="Main navigation" className={`${SHELL} flex min-h-20 flex-wrap items-center justify-between gap-3 py-3`}>
          <Link href="/" aria-label="FlowState home"><BrandLockup size="sm" /></Link>
          <div className="hidden gap-7 text-sm text-graphite md:flex"><a className="hover:text-ink" href="#how-it-works">How it works</a><a className="hover:text-ink" href="#possibilities">What you can build</a><a className="hover:text-ink" href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub ↗</a></div>
          <div className="flex items-center gap-2"><ThemeControl /><Link href="/login" className={`${CTA} hidden sm:inline-flex`}>Get started <span aria-hidden>↗</span></Link><Button variant="ghost" className="md:hidden" aria-label="Toggle navigation" aria-expanded={menuOpen} aria-controls="landing-mobile-menu" onClick={() => setMenuOpen(!menuOpen)}><Icon path={menuOpen ? ICON_PATHS.close : 'M4 6h16M4 12h16M4 18h16'} /></Button></div>
          {menuOpen && <div id="landing-mobile-menu" className="w-full animate-fade-up border-t border-rule py-3 md:hidden"><a className="block py-3" href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a><a className="block py-3" href="#possibilities" onClick={() => setMenuOpen(false)}>What you can build</a><a className="block py-3" href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub ↗</a><Link href="/login" className={`${CTA} mt-3`}>Get started ↗</Link></div>}
        </nav>
      </header>
      <main>
        <section className="relative isolate overflow-hidden border-b border-rule">
          <Image src="/images/pixel-hero-bridge.jpg" alt="Pixel-art woodland bridge over a pond with orange fish" fill priority sizes="100vw" className="-z-10 object-cover object-center" />
          <div className={`${SHELL} flex min-h-[700px] items-start pb-24 pt-20 sm:min-h-[780px] sm:pt-24`}>
            <div className="landing-hero-copy max-w-[600px]">
              <p className="landing-hero-text label-caps text-image-ink">A little less busywork. A little more flow.</p>
              <h1 className="landing-hero-text mt-6 font-serif text-[clamp(52px,6vw,84px)] leading-[1.06] tracking-[-0.035em] text-image-ink">Let your work<br />find its flow.</h1>
              <p className="landing-hero-text mt-6 max-w-[40ch] text-base leading-relaxed text-image-ink">Build workflows that turn triggers into ordered steps, with every run recorded.</p>
              <div className="mt-7 flex flex-wrap items-center gap-5"><Link className={CTA} href="/login">Build your first workflow <span aria-hidden>↗</span></Link><a href="#how-it-works" className="rounded-[3px] bg-paper px-4 py-3 text-sm underline decoration-rule underline-offset-4 hover:decoration-ink">Take a look ↓</a></div>
              <p className="landing-hero-text mt-6 font-mono text-[10px] uppercase tracking-wider text-image-ink">Open source · Self-hostable · Step-by-step history</p>
            </div>
          </div>
          <div className="absolute bottom-0 inset-x-0 flex justify-between gap-4 bg-image-shadow/85 px-6 py-4 font-mono text-[10px] uppercase tracking-widest text-image-ink sm:px-10"><span>From one small event to work, done.</span><span className="hidden sm:block">01 — Find your flow</span></div>
        </section>

        <div className={`${SHELL} flex flex-wrap justify-center gap-x-10 gap-y-4 border-b border-rule py-7 text-sm text-muted`}><span>Start with a webhook</span><span aria-hidden>→</span><span>Run your steps in order</span><span aria-hidden>→</span><span>See exactly what happened</span></div>

        <section id="how-it-works" className={`${SHELL} scroll-mt-8 py-20 sm:py-28`}>
          <Reveal><div className="mx-auto max-w-[640px] text-center"><p className="label-caps text-muted">01 / The idea</p><h2 className="mt-5 font-serif text-4xl leading-tight sm:text-5xl">Something happens.<br />The right things follow.</h2><p className="mt-5 text-base leading-relaxed text-muted">A workflow is one trigger and a sequence of steps. You decide what starts it and what happens next. FlowState queues the work and runs each step in order.</p></div></Reveal>
          <Reveal><WorkflowDemo /></Reveal>
          <Reveal><div className="mt-9 grid gap-8 sm:grid-cols-3">{[
            ['01', 'Choose the starting point.', 'Receive a webhook, watch an API for changes on a schedule, or start a run manually.'],
            ['02', 'Give it the next steps.', 'Call an API, send an email or Telegram message, add a delay, or write a log. Put them in the order you need.'],
            ['03', 'Turn it on. Follow along.', 'Test with a payload, then turn your workflow on. Open any run to inspect what went in, what came out, and where it stopped.'],
          ].map(([n, title, body]) => <div key={n}><p className="font-mono text-xs text-faint">{n} —</p><h3 className="mt-3 text-base font-medium">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted">{body}</p></div>)}</div></Reveal>
        </section>

        <section id="possibilities" className="scroll-mt-8 border-y border-rule bg-paper-2 py-20 sm:py-24"><div className={SHELL}>
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="label-caps text-muted">02 / Small steps. Useful work.</p><h2 className="mt-5 max-w-[520px] font-serif text-4xl sm:text-5xl">Your tools, working<br />in the same direction.</h2></div><p className="max-w-[310px] text-sm leading-relaxed text-muted">Five focused step types. Combine them with your APIs to handle the tasks you keep doing by hand.</p></div>
          <Reveal><div className="mt-12 grid gap-px overflow-hidden rounded-md border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-5">{[
            [GLYPHS.request, 'HTTP request', 'Read or write to an API. Use its response in the steps that follow.'],
            [GLYPHS.email, 'Email', 'Send receipts, updates, or notifications through Resend.'],
            [GLYPHS.message, 'Telegram', 'Bring important updates straight to your chat.'],
            [GLYPHS.wait, 'Delay', 'Leave a little time between one step and the next.'],
            [GLYPHS.log, 'Log message', 'Record a message with context from your payload.'],
          ].map(([glyph, title, body]) => <div key={title} className="bg-card p-6"><Icon path={glyph} className="size-6 text-graphite" /><h3 className="mt-6 text-sm font-semibold">{title}</h3><p className="mt-3 text-sm leading-relaxed text-muted">{body}</p></div>)}</div></Reveal>
        </div></section>

        <Reveal><section className={`${SHELL} grid items-center gap-12 py-20 sm:py-28 lg:grid-cols-2`}>
          <div><p className="label-caps text-muted">03 / The handoff</p><h2 className="mt-5 font-serif text-4xl sm:text-5xl">The data comes<br />along for the ride.</h2><p className="mt-6 max-w-[440px] leading-relaxed text-muted">The trigger brings the starting data. Reference it in your steps with templates. An HTTP request adds its response to the payload, so the next step can use what it found.</p><p className="mt-5 text-sm leading-relaxed text-muted">An order ID becomes an API lookup. The lookup becomes a personalised email. No copying between tabs.</p></div>
          <div className="overflow-hidden rounded-md border border-rule bg-card"><div className="border-b border-rule px-6 py-4 text-sm font-medium">One order, carried through</div>{[
            ['01 / Incoming webhook', 'orderId: "1042"'],
            ['02 / HTTP request URL', 'https://shop.example/orders/{{payload.orderId}}'],
            ['03 / Email message', 'Thanks, {{payload.http.body.customerName}}!'],
          ].map(([label, value]) => <div key={label} className="border-b border-rule-soft p-6 last:border-0"><p className="label-caps text-muted">{label}</p><code className="mt-3 block break-words text-sm leading-relaxed text-ink">{value}</code></div>)}</div>
        </section></Reveal>

        <Reveal><section className="border-y border-rule bg-card py-20 sm:py-24"><div className={`${SHELL} grid items-center gap-12 lg:grid-cols-2`}>
          <div className="order-2 overflow-hidden rounded-md border border-rule bg-paper lg:order-1"><div className="flex items-center justify-between border-b border-rule p-5"><span className="font-serif text-xl">Order updates</span><StateChip tone="fail">Failed</StateChip></div><div className="px-5">{[['Look up the order', 'Succeeded'], ['Email the receipt', 'Succeeded'], ['Notify the team', 'Failed']].map(([title, status], index) => <div key={title} className="flex items-center justify-between gap-3 border-b border-rule-soft py-5"><span className="text-sm"><span className="mr-3 font-mono text-xs text-muted">0{index + 1}</span>{title}</span><StateChip tone={status === 'Failed' ? 'fail' : 'ok'}>{status}</StateChip></div>)}</div><p className="p-5 font-mono text-xs leading-relaxed text-muted">Example run · Telegram request timed out<br />Completed steps remain recorded.</p></div>
          <div className="order-1 lg:order-2"><p className="label-caps text-muted">04 / Clarity, even when things break</p><h2 className="mt-5 font-serif text-4xl sm:text-5xl">Less guessing.<br />More knowing.</h2><p className="mt-6 leading-relaxed text-muted">Every run has a history. Inspect each step’s status, input, and output to see where a problem started.</p><div className="mt-7 space-y-5"><div><h3 className="text-sm font-semibold">Retry from where it stopped</h3><p className="mt-2 text-sm leading-relaxed text-muted">Automatic retries skip steps that already succeeded. A failing step can run again, so external writes should be idempotent.</p></div><div><h3 className="text-sm font-semibold">Keep duplicate deliveries in check</h3><p className="mt-2 text-sm leading-relaxed text-muted">Signed webhooks verify the sender. Deduplication helps prevent repeated deliveries from starting the same work twice.</p></div></div></div>
        </div></section></Reveal>

        <Reveal><section className={`${SHELL} py-20 text-center sm:py-28`}><p className="label-caps text-muted">Make room for the work you care about.</p><h2 className="mt-6 font-serif text-5xl sm:text-6xl">Build once. Breathe easier.</h2><p className="mx-auto mt-5 max-w-[470px] leading-relaxed text-muted">Start with one task you repeat. Choose a trigger, add your steps, and see your first workflow run.</p><Link href="/login" className={`${CTA} mt-8`}>Get started with Google <span aria-hidden>↗</span></Link><p className="mt-5 text-xs text-muted">Prefer to run it yourself? <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">Explore the source</a>.</p></section></Reveal>
        <div className="relative h-36 overflow-hidden sm:h-52"><Image src="/images/pixel-river.jpg" alt="" fill sizes="100vw" className="object-cover object-[center_70%]" /></div>
      </main>
      <footer className={`${SHELL} flex flex-wrap items-center justify-between gap-5 py-8`}><BrandLockup size="sm" /><p className="text-xs text-muted">Open source. Your workflows. Your flow.</p><a className="text-xs text-muted hover:text-ink" href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub ↗</a></footer>
    </div>
  );
}
