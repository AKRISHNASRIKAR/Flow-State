FlowState · next moves

[What to build](#ideas) [Homepage & UI](#design) [System design](#system)

# Twelve features to build next, each one a real LLM, NLP, ML or n8n project

Start with the AI step. It is about two days on the executor pattern you already have, and four other ideas reuse its model client. Every idea below plugs into an existing seam: a new executor, a new endpoint on both runtimes, or the poller.

## A six-week path

One track per week, ordered so each week reuses the last.

1. **Week 1**AI step (1), plus Slack and Discord actions
2. **Week 2**Explain a failed run (2) and classify & extract (4)
3. **Week 3**Personal access tokens, then n8n import (10)
4. **Week 4**MCP server (12) and the n8n community node (11)
5. **Week 5**Google token refresh and Gmail trigger, then the inbox digest (5)
6. **Week 6**Run anomaly alerts (7) and describe-to-draft (3)

Effort and usefulness are my estimates from reading the codebase, for one developer who knows it. Click a dot to jump to its card.

House rules still apply: each feature lands on both runtimes, shared logic goes in framework-free `backend/src` files, and a `lib/changelog.ts` entry ships only once it works end to end.

## Working better with Google, Apple and the rest

Google token refresh unlocks every Google feature, so it goes first. Apple Shortcuts is the cheapest delight: two days turns Siri, NFC tags and iPhone automations into triggers.

# Keep paper and ink. Let the homepage show a workflow running.

The look is already distinctive; the gap is proof. Today the homepage describes reliability in prose and shows one static screenshot. The changes below put a real run, real templates and copyable code where the paragraphs are, without new colours or fonts.

KeptChangedNewRemoved

## Homepage changes and where the ideas come from

Each change cites the screens it borrows from, gathered on Mobbin. “Ship now” means it only shows what the engine already does.

## Inside the dashboard

The builder already has a docked inspector, readiness check and live run state. These close the remaining gaps that comparable builders handle well.

### Keep

- Paper, ink and signal tokens; signal only for what is live
- Newsreader titles with IBM Plex Sans and Mono
- The pixel landscape hero and its responsive WebP delivery
- The vertical chain canvas until branching exists

### Drop

- “01 / The idea” numbered mono eyebrows on nine sections
- Centred intros; dev-tool pages scan better left-aligned
- The two-paragraph closing call to action
- Any tile for an integration the backend can’t run yet

**Research**

- Mobbin: 34 screens and sections across hero, integrations, templates, prompt-first heroes and workflow builders; 16 shown here (low-resolution previews, linked to the originals).
- [Evil Martians, “We studied 100 dev tool landing pages”](https://evilmartians.com/chronicles/we-studied-100-devtool-landing-pages-here-is-what-actually-works-in-2025): centred heroes are the exception in dev tools.
- [SaaSFrame, “10 SaaS landing page trends for 2026”](https://www.saasframe.io/blog/10-saas-landing-page-trends-for-2026-with-real-examples): real product UI earlier, short product-led copy.
- [Zapier vs Make vs n8n, 2026 comparison](https://dev.to/solevate/best-ai-automation-tools-2026-zapier-vs-make-vs-n8n-compared-4k6j): n8n positioned as the developer option, agent features still maturing elsewhere.

# One engine, two runtimes. The next pressure points are tokens, outbound calls and parity.

The core is sound: ingress never executes, admission is enforced by infrastructure, and retries resume from a checkpoint. What the roadmap needs next sits at the edges: a broker for Google tokens, non-browser credentials for agents and n8n, and guard rails on the HTTP calls users configure.

Solid: what runs today on both runtimes (Workflows + D1 on Cloudflare, BullMQ + Postgres on NestJS). Dashed blue: proposed. The token broker is the one new box every Google feature depends on.

## How a run moves today

1. **Ingress validates and returns**Webhook checks HMAC with `timingSafeEqual`, dedups on `(workflowId, idempotencyKey)`, emits `workflow.triggered`, returns 200.
2. **Admission decides**Workflow ACTIVE, fewer than 3 running, under 100 runs an hour. Refusals are recorded as `SKIPPED*` on the event.
3. **A durable run executes the chain**One `step.do` per action (or a BullMQ job). Each success writes its row and the payload checkpoint together; a retry resumes at the first unfinished step.

## What to improve, in order

P1 items unblock the roadmap; P2 close known risks; P3 make the system easier to run and extend.

| Priority | Change | Why now | Effort |
| --- | --- | --- | --- |

One decision worth making soon: production runs only on Cloudflare, yet every change still lands twice. Either put the 49/50 side-by-side parity check in CI, or freeze NestJS as a local reference and stop adding features to it.

Prepared 21 November 2026 from the FlowState repository at `dd18d77`. Inspiration images are Mobbin previews of other products, shown for reference only.