'use client';

import type { Workflow } from '@flowstate/api-types';
import type { ReactNode } from 'react';
import { Button, Icon, ICON_PATHS } from '../../components/ui';
import { useActions, useHasRun, useTrigger } from './queries';

interface SetupChecklistProps {
  workflow: Workflow;
  onChooseTrigger: () => void;
  onAddStep: () => void;
  onTurnOn: () => void;
  onTestRun: () => void;
  turningOn: boolean;
  /** Inside the builder's inspector: no card of its own. */
  compact?: boolean;
}

interface Item {
  id: string;
  title: string;
  hint: string;
  done: boolean;
  action: ReactNode;
}

/**
 * The next thing to do, for a workflow that isn't fully set up yet.
 *
 * The order is dictated by the engine, not taste: a test run is refused
 * unless the workflow is on (manual fire requires ACTIVE), so "turn it on"
 * has to come before "send a test run".
 */
export function SetupChecklist({ workflow, onChooseTrigger, onAddStep, onTurnOn, onTestRun, turningOn, compact = false }: SetupChecklistProps) {
  const trigger = useTrigger(workflow.id);
  const actions = useActions(workflow.id);
  const hasRun = useHasRun(workflow.id);

  // Hold off until everything is known, so the list doesn't flash items as
  // "to do" that are actually done.
  if (trigger.data === undefined || actions.data === undefined || hasRun.data === undefined) return null;

  const hasTrigger = trigger.data !== null;
  const hasSteps = actions.data.length > 0;
  const isOn = workflow.status === 'ACTIVE';

  const items: Item[] = [
    {
      id: 'trigger',
      title: 'Choose what starts it',
      hint: 'A webhook from another app, a check on a schedule, or a button you press.',
      done: hasTrigger,
      action: (
        <Button size="sm" variant="primary" onClick={onChooseTrigger}>
          Choose trigger
        </Button>
      ),
    },
    {
      id: 'steps',
      title: 'Add a step',
      hint: 'What should happen each time — call a URL, send an email, post to Telegram…',
      done: hasSteps,
      action: (
        <Button size="sm" variant="primary" onClick={onAddStep}>
          Add step
        </Button>
      ),
    },
    {
      id: 'on',
      title: 'Turn it on',
      hint: 'Workflows only run while they’re on.',
      done: isOn,
      action: (
        <Button size="sm" variant="primary" onClick={onTurnOn} disabled={turningOn || !hasTrigger || !hasSteps}>
          {turningOn ? 'Turning on…' : 'Turn on'}
        </Button>
      ),
    },
    {
      id: 'test',
      title: 'Send a test run',
      hint: 'Run it once with sample data and check each step’s result.',
      done: hasRun.data,
      action: (
        <Button size="sm" variant="primary" onClick={onTestRun} disabled={!isOn || !hasTrigger}>
          Test run
        </Button>
      ),
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null;
  const nextId = items.find((i) => !i.done)?.id;

  return (
    <section
      aria-labelledby="setup-heading"
      className={compact ? '' : 'mb-6 rounded-md border border-rule bg-card p-5'}
    >
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="label-caps text-signal">Setup</p>
          <h2 id="setup-heading" className="mt-2 font-serif text-[22px] leading-tight text-ink">
            Finish setting up
          </h2>
        </div>
        <span className="font-mono text-[12px] text-muted tabular-nums">
          {doneCount} of {items.length}
        </span>
      </div>
      {/* The checklist is itself a little flow: done steps are filled, the
          next one is live, the rest wait below it on the rail. */}
      <ol className="relative mt-4">
        <span aria-hidden className="absolute bottom-4 left-[11px] top-4 w-px bg-rule" />
        {items.map((item, index) => {
          const isNext = item.id === nextId;
          return (
            <li key={item.id} className={`relative flex items-start gap-3 py-2 ${compact ? '' : 'sm:items-center'}`}>
              <span
                className={`relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-medium ${
                  item.done
                    ? 'bg-ink text-paper'
                    : isNext
                      ? 'bg-card text-signal ring-2 ring-signal'
                      : 'bg-card text-muted ring-1 ring-rule'
                }`}
              >
                {item.done ? <Icon path={ICON_PATHS.check} className="size-3.5" strokeWidth={2.5} /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${item.done ? 'text-muted line-through decoration-rule' : 'text-ink'}`}>
                  {item.title}
                  {item.done && <span className="sr-only"> (done)</span>}
                </p>
                {isNext && <p className="mt-0.5 text-[13px] leading-snug text-graphite">{item.hint}</p>}
                {isNext && compact && <div className="mt-2.5">{item.action}</div>}
              </div>
              {isNext && !compact && <div className="shrink-0">{item.action}</div>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
