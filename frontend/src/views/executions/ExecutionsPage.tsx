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
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Executions</h1>
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
