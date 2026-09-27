import type { Action, ActionType, Trigger, Workflow } from '@flowstate/api-types';
import { ACTION_META, actionSchemas, configurationToForm } from '../flow/action-meta';

export type ReadinessTone = 'ready' | 'blocked' | 'off';

export interface Readiness {
  tone: ReadinessTone;
  /** Short pill text: "Ready to run", "2 steps need setup"… */
  label: string;
  /** Longer explanation for a tooltip / the inspector. */
  detail: string;
  /** Steps whose saved settings wouldn't pass the step form — flagged on the canvas. */
  problems: Map<string, string>;
}

const isKnownType = (type: string): type is ActionType => type in ACTION_META;

/**
 * Can this workflow run, and if not, why? Checked in the browser with the
 * same rules the step forms enforce (actionSchemas), plus the engine's own
 * rule that only an ACTIVE workflow can be fired. The server still decides —
 * this only makes the answer visible before you press Test run.
 */
export function assessReadiness(workflow: Workflow, trigger: Trigger | null, actions: Action[]): Readiness {
  const problems = new Map<string, string>();
  for (const action of actions) {
    if (!isKnownType(action.type)) {
      problems.set(action.id, `Unknown step type “${action.type}”`);
      continue;
    }
    const parsed = actionSchemas[action.type].safeParse(configurationToForm(action.type, action.configuration ?? {}));
    if (!parsed.success) problems.set(action.id, parsed.error.issues[0]?.message ?? 'Incomplete settings');
  }

  if (!trigger) {
    return { tone: 'blocked', label: 'Needs a trigger', detail: 'Choose what starts this workflow.', problems };
  }
  if (actions.length === 0) {
    return { tone: 'blocked', label: 'Add a step', detail: 'A workflow needs at least one step to run.', problems };
  }
  if (problems.size > 0) {
    const n = problems.size;
    return {
      tone: 'blocked',
      label: `${n} step${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} setup`,
      detail: 'Open the flagged steps to finish their settings.',
      problems,
    };
  }
  if (workflow.status !== 'ACTIVE') {
    return { tone: 'off', label: 'Off', detail: 'Everything is set up. Turn it on to let it run.', problems };
  }
  return { tone: 'ready', label: 'Ready to run', detail: 'Set up and switched on.', problems };
}
