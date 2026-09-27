'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useRef, useState } from 'react';
import { FlowNodeCard } from '../../components/flow-visuals';
import { BrandLockup } from '../../components/Logo';
import { GLYPHS } from '../../lib/glyphs';
import { Connectors } from '../../features/landing/Connectors';
import { HeroFlow } from '../../features/landing/HeroFlow';
import { IdeaToFlow } from '../../features/landing/IdeaToFlow';
import { ProductShowcase } from '../../features/landing/ProductShowcase';
import { SectionHead, SpineTrack, Station } from '../../features/landing/Spine';
import { StoryPipeline } from '../../features/landing/StoryPipeline';
import { Transformation } from '../../features/landing/Transformation';
import { useScrollProgress } from '../../features/landing/useScrollProgress';

const GITHUB_URL = 'https://github.com/AKRISHNASRIKAR/Flow-State';

// /login bounces an already-restored session straight to /workflows, so one
// link serves both a first-time visitor and a returning user.
const PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-[5px] bg-ink px-5 py-3 text-[15px] font-medium text-paper transition-colors hover:bg-graphite focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';
const SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-[5px] px-5 py-3 text-[15px] font-medium text-ink ring-1 ring-rule transition-colors hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';

function Nav() {
  return (
    <nav className="sticky top-0 z-40 border-b border-rule bg-paper/95">
      <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-8 px-5 sm:px-8 lg:px-12">
        <Link href="/" aria-label="FlowState home">
          <BrandLockup size="sm" />
        </Link>
        <div className="hidden items-center gap-6 text-[14px] text-graphite md:flex">
          <a href="#story" className="hover:text-ink">How it works</a>
          <a href="#connectors" className="hover:text-ink">Connectors</a>
          <a href="#product" className="hover:text-ink">The builder</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-ink">GitHub</a>
        </div>
        <Link href="/login" className="ml-auto rounded-[5px] bg-ink px-3.5 py-2 text-[14px] font-medium text-paper hover:bg-graphite">
          Sign in
        </Link>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative grid grid-cols-[minmax(0,1fr)] gap-14 pb-24 pt-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center lg:gap-12 lg:pb-32 lg:pt-20">
      <div className="relative pl-[64px] lg:pl-[88px]">
        <Station n="00" />
        <p className="label-caps pt-[7px] text-signal">Idea → automation</p>
        <h1 className="mt-6 font-serif text-[clamp(46px,9vw,64px)] leading-[0.98] tracking-[-0.025em] text-ink lg:text-[clamp(60px,5.4vw,80px)]">
          <span className="block sm:whitespace-nowrap">Design it once.</span>
          <em className="block text-signal">Let it run.</em>
        </h1>
        <p className="mt-7 max-w-[44ch] text-[18px] leading-relaxed text-graphite">
          FlowState turns a job you repeat by hand into a workflow. Something happens, the steps run in order, and every
          run is recorded, step by step.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link href="/login" className={PRIMARY}>
            Continue with Google
          </Link>
          <a href="#story" className={SECONDARY}>
            See how a run works ↓
          </a>
        </div>
        <p className="mt-8 font-mono text-[12px] text-muted">Webhooks · schedules · retries per step · every run recorded</p>
      </div>
      {/* Full width on phones: the panel sits over the spine rather than beside it. */}
      <div className="relative z-10 sm:pl-[64px] lg:pl-0">
        <HeroFlow />
      </div>
    </section>
  );
}

// The repetitive work, made visible: every order, the same eight steps.
const ORDERS = ['1041', '1042', '1043', '1044', '1045', '1046', '1047'];
const STEPS_PER_ORDER = 8;

function ManualWork() {
  const [done, setDone] = useState(0);
  const last = useRef(0);
  const ref = useScrollProgress<HTMLElement>({
    onChange: (p) => {
      const total = ORDERS.length * STEPS_PER_ORDER;
      const n = Math.round(Math.min(1, Math.max(0, (p - 0.25) / 0.4)) * total);
      if (n !== last.current) {
        last.current = n;
        setDone(n);
      }
    },
  });

  return (
    <section ref={ref} className="relative py-24 lg:py-32" style={{ '--p': 0 } as CSSProperties}>
      <SectionHead n="01" stage="Problem · manual work" title="You already run a workflow. By hand.">
        <p>
          A new order arrives, and someone opens the email, copies the number, looks it up, writes the receipt, sends it,
          and tells the team. Then the next order arrives, and they do it all again.
        </p>
      </SectionHead>

      <div className="mt-14 pl-[64px] lg:pl-[88px]">
        <div className="max-w-[640px] rounded-md border border-rule bg-card p-5">
          <div className="flex items-baseline justify-between gap-4">
            <p className="label-caps text-muted">This week · by hand</p>
            <p className="font-mono text-[12px] text-muted tabular-nums">
              <span className="text-ink">{done}</span> / {ORDERS.length * STEPS_PER_ORDER} manual steps
            </p>
          </div>
          <div className="mt-4 grid gap-1.5">
            {ORDERS.map((order, row) => (
              <div key={order} className="flex items-center gap-3">
                <span className="w-12 shrink-0 font-mono text-[11px] text-faint">#{order}</span>
                <div className="grid flex-1 grid-cols-8 gap-1.5">
                  {Array.from({ length: STEPS_PER_ORDER }, (_, col) => {
                    const on = row * STEPS_PER_ORDER + col < done;
                    return (
                      <span
                        key={col}
                        className={`h-4 rounded-[2px] border transition-colors duration-300 ${
                          on ? 'border-graphite/40 bg-graphite/70' : 'border-rule bg-paper'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            Seven orders, eight steps each: the same fifty-six clicks and copy-pastes, every week, done perfectly each time
            — until one isn’t.
          </p>
        </div>
      </div>
    </section>
  );
}

function FinalCall() {
  return (
    <section className="relative pt-24 lg:pt-32">
      <SectionHead n="11" accent stage="FlowState" title={<>Build yours.</>}>
        <p>Sign in with Google and your first workflow is a minute away: choose what starts it, add the steps, press Test run, and watch it go.</p>
      </SectionHead>
      <div className="mt-10 flex flex-wrap gap-3 pl-[64px] lg:pl-[88px]">
        <Link href="/login" className={PRIMARY}>
          Continue with Google
        </Link>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={SECONDARY}>
          Read the source on GitHub
        </a>
      </div>
      {/* Where the spine ends: the result every flow is heading for. */}
      <div className="relative mt-20 max-w-[380px]">
        <span aria-hidden className="absolute left-[21px] top-0 h-8 w-px bg-signal" />
        <div className="pt-8">
          <FlowNodeCard kind="result" label="Result" title="Automated — and you can see every run" glyph={GLYPHS.check} state={{ tone: 'ok', text: 'done' }} />
        </div>
      </div>
    </section>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-paper">
      <Nav />
      <main className="mx-auto max-w-[1240px] px-5 sm:px-8 lg:px-12">
        <SpineTrack>
          <Hero />
          <ManualWork />
          <StoryPipeline />
          <Transformation />
          <Connectors />
          <IdeaToFlow />
          <ProductShowcase />
          <FinalCall />
        </SpineTrack>
        <div className="h-16" />
      </main>
      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-[13px] text-muted sm:px-8 lg:px-12">
          <span className="flex items-center gap-2.5">
            <BrandLockup size="sm" wordmark={false} />
            <span>FlowState · MIT License · built by Akhil Krishna</span>
          </span>
          <span className="flex gap-5">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-ink">GitHub</a>
            <Link href="/login" className="hover:text-ink">Sign in</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
