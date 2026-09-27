'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Action } from '@flowstate/api-types';
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';
import { Button, ConfirmDialog, Spinner } from '../../components/ui';
import { actionsApi } from '../../lib/api';
import { toast } from '../../lib/toast';
import { useActions, useTrigger } from '../workflow/queries';
import type { LatestRun } from '../workflow/useLatestRun';
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
  /** Which node the inspector is showing. */
  selected: { kind: 'trigger' } | { kind: 'step'; id: string | null } | null;
  /** The latest run, painted onto the nodes. */
  run: LatestRun;
  /** Steps whose settings need finishing (see readiness.ts). */
  problems: Map<string, string>;
  /** e.g. "fired 2 min ago". */
  lastFired?: string;
}

export function FlowCanvas({ workflowId, onEditTrigger, onEditStep, selected, run, problems, lastFired }: FlowCanvasProps) {
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
        data: { trigger, onEdit: onEditTrigger, selected: selected?.kind === 'trigger', lastFired },
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
          selected: selected?.kind === 'step' && selected.id === action.id,
          run: run.steps.get(action.id),
          problem: problems.get(action.id),
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
  }, [trigger, actions, sorted, selected, run.steps, problems, lastFired]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const flow = useRef<ReactFlowInstance | null>(null);

  useEffect(() => {
    setNodes(layoutNodes);
  }, [layoutNodes, setNodes]);

  // fitView only runs on mount, before the steps have loaded — refit whenever
  // the chain gets longer or shorter so every node is in view.
  const nodeCount = layoutNodes.length;
  useEffect(() => {
    if (nodeCount === 0) return;
    const id = requestAnimationFrame(() => void flow.current?.fitView({ padding: 0.22, maxZoom: 1, duration: 250 }));
    return () => cancelAnimationFrame(id);
  }, [nodeCount]);

  const edges = useMemo<Edge[]>(() => {
    if (trigger === undefined || actions === undefined) return [];
    const chain = ['trigger', ...sorted.map((a) => a.id), 'add'];
    return chain.slice(0, -1).map((source, i) => {
      const target = chain[i + 1];
      // Data is moving into the running step right now: signal blue, animated.
      const live = target === run.runningActionId;
      return {
        id: `e-${source}-${target}`,
        source,
        target,
        type: 'straight',
        animated: live || target === 'add',
        style: {
          stroke: live ? 'var(--color-signal)' : target === 'add' ? 'var(--color-faint)' : 'var(--color-ink)',
          strokeOpacity: live ? 1 : 0.45,
          strokeWidth: live ? 2 : 1.25,
        },
      };
    });
  }, [trigger, actions, sorted, run.runningActionId]);

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
      <div className="rounded-md border border-rule bg-card p-10 text-center">
        <p className="text-sm text-graphite">The steps couldn’t be loaded.</p>
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

  return (
    <>
      <div className="h-full min-h-[440px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onInit={(instance) => {
            flow.current = instance;
          }}
          nodesConnectable={false}
          deleteKeyCode={null}
          fitView
          fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
          minZoom={0.4}
          maxZoom={1.25}
          colorMode="light"
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="var(--color-rule)" bgColor="var(--color-paper)" />
        </ReactFlow>
      </div>

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
