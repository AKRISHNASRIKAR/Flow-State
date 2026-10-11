import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { DashboardHeading } from '../../components/DashboardHeading';
import { inputClass } from '../../components/ui';
import { ExecutionsTable } from '../../features/executions/ExecutionsTable';
import { StatsWidget } from '../../features/executions/StatsWidget';
import { workflowsApi } from '../../lib/api';

export function ExecutionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workflowId = searchParams.get('workflowId') ?? '';
  const setWorkflowId = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set('workflowId', id);
    else params.delete('workflowId');
    params.delete('page');
    router.replace(params.size ? `/executions?${params}` : '/executions', { scroll: false });
  };

  // Workflow filter options — first 100 is plenty for a filter dropdown.
  const { data: workflows } = useQuery({
    queryKey: ['workflows', 'filter-options'],
    queryFn: () => workflowsApi.list(1, 100),
    staleTime: 60_000,
    meta: { errorContext: 'Couldn’t load the workflow filter' },
  });

  return (
    <div>
      <DashboardHeading eyebrow="Workspace / Run history" title="See your work happen." description="Every trigger starts a story. Follow the outcome, inspect the steps, and find exactly where a run needs your attention." action={<Link href="/workflows" className="text-sm font-medium underline decoration-rule underline-offset-4">Back to workflows ↗</Link>} />
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
