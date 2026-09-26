'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Action } from '@flowstate/api-types';
import { Background, BackgroundVariant, ReactFlow, useNodesState, type Edge, type Node } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import { Button, ConfirmDialog, Spinner } from '../../components/ui';
import { actionsApi } from '../../lib/api';
import { toast } from '../../lib/toast';
import { useActions, useTrigger } from '../workflow/queries';
import { ActionNode, AddActionNode, TriggerNode } from './nodes';

// The execution engine runs a strict linear chain (one trigger, actions in
// `order` ascending — no branching or merging). The canvas therefore renders
// a fixed vertical stack with derived edges; it is deliberately NOT a
// free-form DAG editor, and there is no way to draw edges by hand.
const GAP_Y = 130;

const nodeTypes = { trigger: TriggerNode, action: ActionNode, add: AddActionNode };

const actionY = (index: number) => (index + 1) * GAP_Y;

interface FlowCanvasProps {
  workflowId: string;
  onEditTrigger: () => void;
  /** null → add a new step. */
  onEditStep: (action: Action | null) => void;
}

export function FlowCanvas({ workflowId, onEditTrigger, onEditStep }: FlowCanvasProps) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<Action | null>(null);

  const actionsQuery = useActions(workflowId);
  const triggerQuery = useTrigger(workflowId);
  const actions = actionsQuery.data;
  const trigger = triggerQuery.data;

  const sorted = useMemo(() => [...(actions ?? [])].sort((a, b) => a.order - b.order), [actions]);

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) => actionsApi.reorder(workflowId, orderedIds),
    meta: { errorContext: 'Couldn’t reorder the steps — the previous order is back' },
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
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['actions', workflowId], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['actions', workflowId] }),
  });

  const remove = useMutation({
    mutationFn: (actionId: string) => actionsApi.remove(workflowId, actionId),
    meta: { errorContext: 'Couldn’t delete the step' },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['actions', workflowId] });
      setDeleting(null);
      toast.success('Step deleted');
    },
  });

  const move = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (toIndex < 0 || toIndex >= sorted.length || toIndex === fromIndex) return;
      const reordered = [...sorted];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      reorder.mutate(reordered.map((a) => a.id));
    },
    [sorted, reorder],
  );

  const layoutNodes = useMemo<Node[]>(() => {
    if (trigger === undefined || actions === undefined) return [];
    return [
      {
        id: 'trigger',
        type: 'trigger',
        position: { x: 0, y: 0 },
        // draggable stays off, but selectable must stay on — React Flow gives
        // fully non-interactive nodes pointer-events:none, which would swallow
        // the node's own buttons.
        draggable: false,
        data: { trigger, onEdit: onEditTrigger },
      },
      ...sorted.map<Node>((action, index) => ({
        id: action.id,
        type: 'action',
        position: { x: 0, y: actionY(index) },
        data: {
          action,
          index,
          isFirst: index === 0,
          isLast: index === sorted.length - 1,
          onEdit: () => onEditStep(action),
          onMove: (direction: -1 | 1) => move(index, index + direction),
          onDelete: () => {
            // Only ask for confirmation when there's configuration to lose.
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
        data: { onAdd: () => onEditStep(null), isFirst: sorted.length === 0 },
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, actions, sorted]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);

  useEffect(() => {
    setNodes(layoutNodes);
  }, [layoutNodes, setNodes]);

  const edges = useMemo<Edge[]>(() => {
    if (trigger === undefined || actions === undefined) return [];
    const chain = ['trigger', ...sorted.map((a) => a.id), 'add'];
    return chain.slice(0, -1).map((source, i) => ({
      id: `e-${source}-${chain[i + 1]}`,
      source,
      target: chain[i + 1],
      type: 'straight',
      animated: chain[i + 1] === 'add',
      style: { stroke: '#525252', strokeWidth: 1.5 },
    }));
  }, [trigger, actions, sorted]);

  // Constrain dragging to the vertical axis — steps can only be reordered
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
      if (node.type !== 'action') return;
      const fromIndex = sorted.findIndex((a) => a.id === node.id);
      if (fromIndex === -1) return;
      const toIndex = Math.min(sorted.length - 1, Math.max(0, Math.round((node.position.y - GAP_Y) / GAP_Y)));
      if (toIndex === fromIndex) {
        setNodes(layoutNodes); // snap back into place
        return;
      }
      move(fromIndex, toIndex);
    },
    [sorted, layoutNodes, move, setNodes],
  );

  if (actionsQuery.isPending || triggerQuery.isPending) return <Spinner label="Loading the workflow’s steps…" />;

  if (actionsQuery.isError || triggerQuery.isError) {
    return (
      <div className="rounded-2xl bg-neutral-900 p-10 text-center ring-1 ring-neutral-800">
        <p className="text-sm text-neutral-300">The steps couldn’t be loaded.</p>
        <Button
          className="mt-3"
          onClick={() => {
            void actionsQuery.refetch();
            void triggerQuery.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const canvasHeight = Math.max(420, (sorted.length + 2) * GAP_Y + 60);

  return (
    <>
      <div className="overflow-hidden rounded-2xl bg-black ring-1 ring-neutral-800" style={{ height: Math.min(canvasHeight, 680) }}>
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
        Steps run top to bottom, one after another. Click any box to edit it; use the arrows (or drag) to reorder.
      </p>

      {deleting && (
        <ConfirmDialog
          title="Delete this step?"
          body="Its settings will be lost. The steps below it move up."
          confirmLabel="Delete step"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
