import { StateGraph, Annotation, START, END, MemorySaver } from '@langchain/langgraph';
import type { CompiledStateGraph } from '@langchain/langgraph';
import { callModel } from '../../domain/models/model-gateway.js';
import { authorizeToolExecution, recordToolInvocation, getToolDefinition } from '../../domain/tools/tool-gateway.js';
import { evaluatePolicy, computeActionHash } from '../../domain/policies/policy-engine.js';
import { createApproval, getApproval, isApprovalValid } from '../../domain/approvals/approval-service.js';
import { transitionTask } from '../../domain/tasks/task-service.js';
import { executeInSandbox, provisionSandbox, getSandbox } from '../../domain/tasks/sandbox-manager.js';
import { recordUsage } from '../../domain/usage/usage-service.js';
import { recordAuditEvent } from '../../domain/audit/audit-service.js';
import { notifyTaskEvent } from '../../domain/notifications/notification-service.ts';
import { TaskStatus, AgentRunStatus } from '../../config/constants.js';
import { logger } from '../../config/logger.js';
import { SupabaseCheckpointSaver } from '../../adapters/langgraph/supabase-checkpoint.js';
import type { CheckpointSaver } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/langgraph';

// ===== Agent State Definition =====

const AgentState = Annotation.Root({
  workspace_id: Annotation<string>,
  task_id: Annotation<string>,
  agent_run_id: Annotation<string>,
  user_id: Annotation<string>,
  role: Annotation<string>,
  objective: Annotation<string>,
  service_id: Annotation<string>,
  conversation_context: Annotation<string>,
  messages: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  current_phase: Annotation<string>({ reducer: (_, b) => b, default: () => 'supervisor' }),
  plan: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  research_findings: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  strategy: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  execution_results: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  content_deliverables: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  review_result: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  delegated_agents: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  pending_approval_id: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  approval_decision: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  error: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  final_result: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  status: Annotation<string>({ reducer: (_, b) => b, default: () => AgentRunStatus.RUNNING }),
  sandbox_id: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  tool_allowlist: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  budget_limit_tokens: Annotation<number>({ reducer: (_, b) => b, default: () => 50000 }),
  tokens_used: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
});

export type KalizaAgentState = typeof AgentState.State;

// ===== Agent Implementations =====

async function callAgentModel(
  state: KalizaAgentState,
  systemPrompt: string,
  userPrompt: string,
  taskType: string,
): Promise<string> {
  const response = await callModel({
    workspace_id: state.workspace_id,
    task_id: state.task_id,
    agent_run_id: state.agent_run_id,
    task_type: taskType,
    system_prompt: systemPrompt,
    prompt: userPrompt,
    max_tokens: 2000,
    temperature: 0.4,
  });

  return response.content;
}

// ===== Supervisor =====

async function supervisorNode(state: KalizaAgentState): Promise<Partial<KalizaAgentState>> {
  logger.info('Supervisor evaluating task', { taskId: state.task_id, phase: state.current_phase });

  if (state.current_phase === 'supervisor') {
    const plan = await callAgentModel(
      state,
      `You are the Kaliza Supervisor. You coordinate a multi-agent team to accomplish business tasks.
Analyze the user's objective and determine which specialist agents are needed.

Available specialists:
- planning: Breaks complex requests into actionable steps
- research: Gathers information using authorized tools
- strategy: Evaluates options and develops recommendations
- execution: Carries out approved actions through the tool gateway
- content: Produces documents, messages, and deliverables
- review: Validates results against the objective

Respond with a JSON plan: {"delegated_agents": ["planning", ...], "reasoning": "..."}`,
      `Objective: ${state.objective}\nContext: ${state.conversation_context}`,
      'reasoning',
    );

    return {
      current_phase: 'planning',
      plan,
      delegated_agents: ['planning'],
      messages: [`[supervisor] Delegating to planning agent`],
    };
  }

  // After specialists have run, supervisor decides next step
  if (state.current_phase === 'review') {
    if (state.review_result.includes('PASS') || state.review_result.includes('COMPLETE')) {
      return {
        status: AgentRunStatus.COMPLETED,
        final_result: state.review_result,
        current_phase: 'end',
        messages: [`[supervisor] Task completed successfully`],
      };
    }
    return {
      status: AgentRunStatus.FAILED,
      final_result: state.review_result,
      current_phase: 'end',
      messages: [`[supervisor] Task did not pass review`],
    };
  }

  return { current_phase: 'end' };
}

// ===== Planning Agent =====

async function planningNode(state: KalizaAgentState): Promise<Partial<KalizaAgentState>> {
  logger.info('Planning agent working', { taskId: state.task_id });

  const planText = await callAgentModel(
    state,
    `You are the Kaliza Planning agent. Break down the objective into concrete, actionable steps.
For each step, identify:
- What needs to be done
- Which agent should handle it
- What tools are needed
- Whether approval is required (for high-risk actions like publishing, spending, or sending external messages)

Respond with a structured plan.`,
    `Objective: ${state.objective}\nAvailable tools: ${state.tool_allowlist.join(', ')}`,
    'classification',
  );

  return {
    current_phase: 'research',
    plan: planText,
    messages: [`[planning] Created execution plan`],
  };
}

// ===== Research Agent =====

async function researchNode(state: KalizaAgentState): Promise<Partial<KalizaAgentState>> {
  logger.info('Research agent working', { taskId: state.task_id });

  const findings = await callAgentModel(
    state,
    `You are the Kaliza Research agent. Gather and evaluate information relevant to the objective.
Use the plan to guide your research. Distinguish verified information from assumptions.
Produce structured findings that other agents can use.`,
    `Objective: ${state.objective}\nPlan: ${state.plan}`,
    'research',
  );

  return {
    current_phase: 'strategy',
    research_findings: findings,
    messages: [`[research] Gathered findings`],
  };
}

// ===== Strategy Agent =====

async function strategyNode(state: KalizaAgentState): Promise<Partial<KalizaAgentState>> {
  logger.info('Strategy agent working', { taskId: state.task_id });

  const strategyText = await callAgentModel(
    state,
    `You are the Kaliza Strategy agent. Evaluate the research findings and develop an execution strategy.
Identify risks, opportunities, and alternatives. Determine which actions require human approval.`,
    `Objective: ${state.objective}\nResearch: ${state.research_findings}\nPlan: ${state.plan}`,
    'reasoning',
  );

  return {
    current_phase: 'execution',
    strategy: strategyText,
    messages: [`[strategy] Developed execution strategy`],
  };
}

// ===== Execution Agent =====

async function executionNode(state: KalizaAgentState): Promise<Partial<KalizaAgentState>> {
  logger.info('Execution agent working', { taskId: state.task_id });

  const results: string[] = [];

  // Provision a sandbox if execution requires isolated compute
  let sandboxId = state.sandbox_id;
  if (!sandboxId) {
    try {
      const sandbox = await provisionSandbox({
        workspace_id: state.workspace_id,
        task_id: state.task_id,
      });
      sandboxId = sandbox.id;
      logger.info('Sandbox provisioned for execution', { taskId: state.task_id, sandboxId });
    } catch (err) {
      logger.warn('Sandbox provisioning failed, continuing without sandbox', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Execute a command in the sandbox if available
  if (sandboxId) {
    try {
      const result = await executeInSandbox({
        sandbox_id: sandboxId,
        command: 'echo "Kaliza agent execution environment ready" && uname -a',
      });
      results.push(`Sandbox execution: exit=${result.exit_code}, stdout=${result.stdout}`);
    } catch (err) {
      results.push(`Sandbox execution error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Check if the strategy requires any tool execution through the tool gateway
  const execResult = await callAgentModel(
    state,
    `You are the Kaliza Execution agent. Carry out approved actions through the tool gateway.
For each action, check if it requires approval. If it does, report that approval is needed.

Available tools: ${state.tool_allowlist.join(', ') || 'none configured'}`,
    `Objective: ${state.objective}\nStrategy: ${state.strategy}\nSandbox available: ${sandboxId ? 'yes' : 'no'}`,
    'reasoning',
  );

  results.push(execResult);

  return {
    current_phase: 'content',
    execution_results: results,
    sandbox_id: sandboxId,
    messages: [`[execution] Completed execution phase`],
  };
}

// ===== Content Agent =====

async function contentNode(state: KalizaAgentState): Promise<Partial<KalizaAgentState>> {
  logger.info('Content agent working', { taskId: state.task_id });

  const deliverable = await callAgentModel(
    state,
    `You are the Kaliza Content agent. Produce the final deliverables based on all prior work.
This may include documents, proposals, messages, reports, or other content.
Do not publish or send consequential external communications without authorization.`,
    `Objective: ${state.objective}\nResearch: ${state.research_findings}\nStrategy: ${state.strategy}\nExecution: ${state.execution_results.join('\n')}`,
    'content',
  );

  return {
    current_phase: 'review',
    content_deliverables: [deliverable],
    messages: [`[content] Produced deliverables`],
  };
}

// ===== Review Agent =====

async function reviewNode(state: KalizaAgentState): Promise<Partial<KalizaAgentState>> {
  logger.info('Review agent working', { taskId: state.task_id });

  const reviewText = await callAgentModel(
    state,
    `You are the Kaliza Review agent. Check the results against the original objective.
Validate deliverables and execution outcomes. Identify missing information, errors, or incomplete steps.
Respond with PASS or FAIL and a summary of your assessment.`,
    `Objective: ${state.objective}\nPlan: ${state.plan}\nDeliverables: ${state.content_deliverables.join('\n')}\nExecution results: ${state.execution_results.join('\n')}`,
    'reasoning',
  );

  return {
    current_phase: 'review',
    review_result: reviewText,
    messages: [`[review] ${reviewText.substring(0, 100)}`],
  };
}

// ===== Approval Gate =====

async function approvalGateNode(state: KalizaAgentState): Promise<Partial<KalizaAgentState>> {
  if (state.pending_approval_id) {
    const approval = await getApproval(state.pending_approval_id);
    if (approval.decision === 'APPROVED') {
      return {
        pending_approval_id: null,
        approval_decision: 'APPROVED',
        messages: [`[approval-gate] Approved, resuming execution`],
      };
    }
    if (approval.decision === 'REJECTED') {
      return {
        pending_approval_id: null,
        approval_decision: 'REJECTED',
        status: AgentRunStatus.FAILED,
        current_phase: 'end',
        messages: [`[approval-gate] Rejected, stopping execution`],
      };
    }
    // Still pending
    return {
      status: AgentRunStatus.AWAITING_APPROVAL,
      messages: [`[approval-gate] Still awaiting approval`],
    };
  }
  return {};
}

// ===== Routing =====

function routeAfterSupervisor(state: KalizaAgentState): string {
  if (state.current_phase === 'end' || state.status === AgentRunStatus.COMPLETED || state.status === AgentRunStatus.FAILED) {
    return END;
  }
  if (state.current_phase === 'planning') return 'planning';
  if (state.current_phase === 'review') return 'review';
  return 'planning';
}

function routeAfterReview(state: KalizaAgentState): string {
  if (state.review_result.includes('PASS') || state.review_result.includes('COMPLETE')) {
    return 'supervisor';
  }
  return 'supervisor';
}

// ===== Build the Graph =====

export function buildAgentGraph(): CompiledStateGraph<typeof AgentState.State> {
  const graph = new StateGraph(AgentState)
    .addNode('supervisor', supervisorNode)
    .addNode('planning', planningNode)
    .addNode('research', researchNode)
    .addNode('strategy', strategyNode)
    .addNode('execution', executionNode)
    .addNode('content', contentNode)
    .addNode('review', reviewNode)
    .addNode('approval_gate', approvalGateNode)
    .addEdge(START, 'supervisor')
    .addConditionalEdges('supervisor', routeAfterSupervisor)
    .addEdge('planning', 'research')
    .addEdge('research', 'strategy')
    .addEdge('strategy', 'execution')
    .addEdge('execution', 'content')
    .addEdge('content', 'review')
    .addConditionalEdges('review', routeAfterReview)
    .addEdge('approval_gate', 'execution');

  return graph.compile();
}

export function buildAgentGraphWithCheckpoint(workspaceId: string): CompiledStateGraph<typeof AgentState.State> {
  const checkpointer = new SupabaseCheckpointSaver(workspaceId);
  const graph = new StateGraph(AgentState)
    .addNode('supervisor', supervisorNode)
    .addNode('planning', planningNode)
    .addNode('research', researchNode)
    .addNode('strategy', strategyNode)
    .addNode('execution', executionNode)
    .addNode('content', contentNode)
    .addNode('review', reviewNode)
    .addNode('approval_gate', approvalGateNode)
    .addEdge(START, 'supervisor')
    .addConditionalEdges('supervisor', routeAfterSupervisor)
    .addEdge('planning', 'research')
    .addEdge('research', 'strategy')
    .addEdge('strategy', 'execution')
    .addEdge('execution', 'content')
    .addEdge('content', 'review')
    .addConditionalEdges('review', routeAfterReview)
    .addEdge('approval_gate', 'execution');

  return graph.compile({ checkpointer });
}

export async function createCheckpointSaver(workspaceId: string): Promise<CheckpointSaver> {
  return new SupabaseCheckpointSaver(workspaceId);
}
