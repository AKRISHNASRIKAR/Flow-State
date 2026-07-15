import { ExecutionsTable } from './ExecutionsTable';

/** Per-workflow "Runs" tab — the global executions table pre-filtered. */
export function RunsTab({ workflowId }: { workflowId: string }) {
  return <ExecutionsTable workflowId={workflowId} />;
}
