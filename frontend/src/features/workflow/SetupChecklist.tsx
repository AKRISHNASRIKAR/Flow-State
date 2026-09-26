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
export function SetupChecklist({ workflow, onChooseTrigger, onAddStep, onTurnOn, onTestRun, turningOn }: SetupChecklistProps) {
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
    <section aria-labelledby="setup-heading" className="mb-6 rounded-2xl bg-neutral-900 p-5 ring-1 ring-neutral-800">
      <div className="flex items-center justify-between gap-4">
        <h2 id="setup-heading" className="text-sm font-semibold text-white">
          Finish setting up
        </h2>
        <span className="text-xs text-neutral-400">
          {doneCount} of {items.length} done
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-neutral-800" aria-hidden>
        <div className="h-full rounded-full bg-indigo-500 transition-[width]" style={{ width: `${(doneCount / items.length) * 100}%` }} />
      </div>
      <ol className="mt-4 space-y-1">
        {items.map((item, index) => {
          const isNext = item.id === nextId;
          return (
            <li
              key={item.id}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${isNext ? 'bg-indigo-500/10 ring-1 ring-indigo-500/30' : ''}`}
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  item.done
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : isNext
                      ? 'bg-indigo-500 text-white'
                      : 'bg-neutral-800 text-neutral-400'
                }`}
              >
                {item.done ? <Icon path={ICON_PATHS.check} className="size-3.5" strokeWidth={2.5} /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${item.done ? 'text-neutral-400 line-through' : 'text-white'}`}>
                  {item.title}
                  {item.done && <span className="sr-only"> (done)</span>}
                </p>
                {isNext && <p className="mt-0.5 text-xs text-neutral-300">{item.hint}</p>}
              </div>
              {isNext && item.action}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
