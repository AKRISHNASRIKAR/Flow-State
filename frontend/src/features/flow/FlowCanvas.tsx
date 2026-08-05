'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Action, Trigger } from '@flowstate/api-types';
import { Background, BackgroundVariant, ReactFlow, useNodesState, type Edge, type Node } from '@xyflow/react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import { Button, ConfirmDialog, EmptyState, Spinner } from '../../components/ui';
import { actionsApi, triggersApi } from '../../lib/api';
import { ApiError } from '../../lib/api-client';
import { toast } from '../../lib/toast';
import { ActionConfigModal } from './ActionConfigModal';
import { ActionNode, AddActionNode, TriggerNode } from './nodes';

// The execution engine runs a strict linear chain (one trigger, actions in
// `order` ascending — no branching or merging). The canvas therefore renders
// a fixed vertical stack with derived edges; it is deliberately NOT a
// free-form DAG editor, and there is no way to draw edges by hand.
const GAP_Y = 130;

const nodeTypes = { trigger: TriggerNode, action: ActionNode, add: AddActionNode };

const actionY = (index: number) => (index + 1) * GAP_Y;

export function FlowCanvas({ workflowId }: { workflowId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const goToTriggerTab = useCallback(
    () => router.replace(`${pathname}?tab=trigger`),
    [router, pathname],
  );
  const [editing, setEditing] = useState<Action | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Action | null>(null);

  const actionsQuery = useQuery({
    queryKey: ['actions', workflowId],
    queryFn: () => actionsApi.list(workflowId),
  });

  // GET /workflows/:id/trigger 404s when no trigger is configured yet —
  // that's the "configure a trigger to get started" empty state, not an error.
  const triggerQuery = useQuery<Trigger | null>({
    queryKey: ['trigger', workflowId],
    queryFn: async () => {
      try {
        return await triggersApi.get(workflowId);
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 404) return null;
        throw err;
      }
    },
  });

  const actions = actionsQuery.data;
  const trigger = triggerQuery.data;

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) => actionsApi.reorder(workflowId, orderedIds),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: ['actions', workflowId] });
      const previous = queryClient.getQueryData<Action[]>(['actions', workflowId]);
      if (previous) {
        const byId = new Map(previous.map((a) => [a.id, a]));
        queryClient.setQueryData(
          ['actions', workflowId],
          orderedIds.map((id, i) => ({ ...byId.get(id)!, order: i })),
        );
      }
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['actions', workflowId], context.previous);
      toast.error(err instanceof ApiError ? err.message : 'Reorder failed — restored previous order');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['actions', workflowId] }),
  });

  const remove = useMutation({
    mutationFn: (actionId: string) => actionsApi.remove(workflowId, actionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['actions', workflowId] });
      setDeleting(null);
      toast.success('Action deleted');
    },
    onError: (e) => toast.error(e.message),
  });

  const layoutNodes = useMemo<Node[]>(() => {
    if (!trigger || !actions) return [];
    const sorted = [...actions].sort((a, b) => a.order - b.order);
    const nodes: Node[] = [
      {
        id: 'trigger',
        type: 'trigger',
        position: { x: 0, y: 0 },
        // draggable stays off, but selectable must stay on — React Flow gives
        // fully non-interactive nodes pointer-events:none, which would swallow
        // the node's own buttons.
        draggable: false,
        data: { trigger, onEdit: goToTriggerTab },
      },
      ...sorted.map<Node>((action, index) => ({
        id: action.id,
        type: 'action',
        position: { x: 0, y: actionY(index) },
        data: {
          action,
          index,
          onEdit: () => setEditing(action),
          onDelete: () => {
            // Only ask for confirmation when the config is non-trivial.
            if (JSON.stringify(action.configuration ?? {}).length > 24) {
              setDeleting(action);
            } else {
              remove.mutate(action.id);
            }
          },
        },
      })),
      {
        id: 'add',
        type: 'add',
        position: { x: 0, y: actionY(sorted.length) },
        draggable: false,
        data: { onAdd: () => setEditing('new'), isFirst: sorted.length === 0 },
      },
    ];
    return nodes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, actions]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);

  useEffect(() => {
    setNodes(layoutNodes);
  }, [layoutNodes, setNodes]);

  const edges = useMemo<Edge[]>(() => {
    if (!trigger || !actions) return [];
    const sorted = [...actions].sort((a, b) => a.order - b.order);
    const chain = ['trigger', ...sorted.map((a) => a.id), 'add'];
    return chain.slice(0, -1).map((source, i) => ({
      id: `e-${source}-${chain[i + 1]}`,
      source,
      target: chain[i + 1],
      type: 'straight',
      animated: chain[i + 1] === 'add',
      style: { stroke: '#525252', strokeWidth: 1.5 },
    }));
  }, [trigger, actions]);

  // Constrain dragging to the vertical axis — actions can only be reordered
  // within the stack, not placed freely in 2D.
  const onNodeDrag = useCallback(
    (_: unknown, node: Node) => {
      if (node.position.x !== 0) {
        setNodes((current) =>
          current.map((n) => (n.id === node.id ? { ...n, position: { ...n.position, x: 0 } } : n)),
        );
      }
    },
    [setNodes],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (!actions || node.type !== 'action') return;
      const sorted = [...actions].sort((a, b) => a.order - b.order);
      const fromIndex = sorted.findIndex((a) => a.id === node.id);
      if (fromIndex === -1) return;
      const toIndex = Math.min(
        sorted.length - 1,
        Math.max(0, Math.round((node.position.y - GAP_Y) / GAP_Y)),
      );
      if (toIndex === fromIndex) {
        setNodes(layoutNodes); // snap back into place
        return;
      }
      const reordered = [...sorted];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      reorder.mutate(reordered.map((a) => a.id));
    },
    [actions, layoutNodes, reorder, setNodes],
  );

  if (actionsQuery.isPending || triggerQuery.isPending) return <Spinner label="Loading flow…" />;

  if (actionsQuery.isError || triggerQuery.isError) {
    return <EmptyState title="Couldn't load the flow" body="Check that the API is running and try again." />;
  }

  if (!trigger) {
    return (
      <EmptyState
        title="Configure a trigger to get started"
        body="Every workflow starts with exactly one trigger — a webhook, a schedule, or a manual test button. Actions run in order after it fires."
        action={
          <Button variant="primary" onClick={goToTriggerTab}>
            Configure trigger
          </Button>
        }
      />
    );
  }

  const canvasHeight = Math.max(420, ((actions?.length ?? 0) + 2) * GAP_Y + 60);

  return (
    <>
      <div
        className="overflow-hidden rounded-2xl bg-black ring-1 ring-neutral-800"
        style={{ height: Math.min(canvasHeight, 640) }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          nodesConnectable={false}
          deleteKeyCode={null}
          fitView
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          minZoom={0.4}
          maxZoom={1.25}
          // Repaints React Flow's own chrome (attribution, handles, selection
          // ring) for a dark surface — its stylesheet defaults to light.
          colorMode="dark"
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#404040" />
        </ReactFlow>
      </div>
      <p className="mt-2 text-xs text-neutral-400">
        Actions run top to bottom as a linear chain — drag a step vertically to reorder it.
      </p>

      {editing !== null && (
        <ActionConfigModal
          workflowId={workflowId}
          action={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this action?"
          body="Its configuration will be lost. The rest of the chain moves up to fill the gap."
          confirmLabel="Delete action"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
