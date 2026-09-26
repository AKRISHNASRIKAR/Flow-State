import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { inputClass } from '../../components/ui';
import { ExecutionsTable } from '../../features/executions/ExecutionsTable';
import { StatsWidget } from '../../features/executions/StatsWidget';
import { workflowsApi } from '../../lib/api';

export function ExecutionsPage() {
  const [workflowId, setWorkflowId] = useState('');

  // Workflow filter options — first 100 is plenty for a filter dropdown.
  const { data: workflows } = useQuery({
    queryKey: ['workflows', 'filter-options'],
    queryFn: () => workflowsApi.list(1, 100),
    staleTime: 60_000,
    meta: { errorContext: 'Couldn’t load the workflow filter' },
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Runs</h1>
        <p className="mt-1.5 text-sm text-neutral-300">
          Every time a workflow ran, newest first. Open one to see what each step received and returned.
        </p>
      </div>
      <StatsWidget />
      <ExecutionsTable
        key={workflowId}
        workflowId={workflowId === '' ? undefined : workflowId}
        extraFilters={
          <div className="w-56">
            <select
              aria-label="Filter by workflow"
              className={inputClass}
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
            >
              <option value="">All workflows</option>
              {workflows?.data.map((wf) => (
                <option key={wf.id} value={wf.id}>
                  {wf.name}
                </option>
              ))}
            </select>
          </div>
        }
      />
    </div>
  );
}
