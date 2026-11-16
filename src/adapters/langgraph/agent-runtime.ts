import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { callModel } from '../../domain/models/model-gateway.js';
import { transitionTask } from '../../domain/tasks/task-service.js';
import { provisionSandbox, executeInSandbox } from '../../domain/tasks/sandbox-manager.js';
import { runAgentScript, getWorkspaceScopedCredentials, setSandboxEnvVar } from '../../domain/tasks/sandbox-execution.js';
import { notifyTaskEvent } from '../../domain/notifications/notification-service.js';
import { AgentRunStatus } from '../../config/constants.js';
import { logger } from '../../config/logger.js';
import { SupabaseCheckpointSaver } from './supabase-checkpoint.js';

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
export class AgentRunCancelledError extends Error {
  constructor() {
    super('Agent run cancelled');
    this.name = 'AgentRunCancelledError';
  }
}

type ExecutionCheckpoint = () => Promise<void>;

async function checkExecution(checkpoint?: ExecutionCheckpoint): Promise<void> {
  await checkpoint?.();
}

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
async function supervisorNode(state: KalizaAgentState, checkpoint?: ExecutionCheckpoint): Promise<Partial<KalizaAgentState>> {
  await checkExecution(checkpoint);
  logger.info('Supervisor evaluating task', { taskId: state.task_id, phase: state.current_phase });

  if (state.current_phase === 'supervisor') {
    const plan = await callAgentModel(
      state,
      `You are the Kaliza Supervisor. You coordinate a multi-agent team to accomplish business tasks.
Analyze the user's objective and determine which specialist agents are needed.
Available specialists: planning, research, strategy, execution, content, review.
Respond with a structured plan.`,
      `Objective: ${state.objective}\nContext: ${state.conversation_context}`,
      'reasoning',
    );
    return { current_phase: 'planning', plan, messages: ['[supervisor] Delegating to planning agent'] };
  }

  if (state.current_phase === 'review') {
    if (state.review_result.includes('PASS') || state.review_result.includes('COMPLETE')) {
      return { status: AgentRunStatus.COMPLETED, final_result: state.review_result, current_phase: 'end', messages: ['[supervisor] Task completed'] };
    }
    return { status: AgentRunStatus.FAILED, final_result: state.review_result, current_phase: 'end', messages: ['[supervisor] Task failed review'] };
  }
  return { current_phase: 'end' };
}

// ===== Planning =====
async function planningNode(state: KalizaAgentState, checkpoint?: ExecutionCheckpoint): Promise<Partial<KalizaAgentState>> {
  await checkExecution(checkpoint);
  logger.info('Planning agent working', { taskId: state.task_id });
  const planText = await callAgentModel(
    state,
    `You are the Kaliza Planning agent. Break down the objective into concrete, actionable steps. Identify which actions need approval.`,
    `Objective: ${state.objective}\nAvailable tools: ${state.tool_allowlist.join(', ')}`,
    'classification',
  );
  return { current_phase: 'research', plan: planText, messages: ['[planning] Created execution plan'] };
}

// ===== Research =====
async function researchNode(state: KalizaAgentState, checkpoint?: ExecutionCheckpoint): Promise<Partial<KalizaAgentState>> {
  await checkExecution(checkpoint);
  logger.info('Research agent working', { taskId: state.task_id });
  const findings = await callAgentModel(
    state,
    `You are the Kaliza Research agent. Gather and evaluate information. Distinguish verified from assumed.`,
    `Objective: ${state.objective}\nPlan: ${state.plan}`,
    'research',
  );
  return { current_phase: 'strategy', research_findings: findings, messages: ['[research] Gathered findings'] };
}

// ===== Strategy =====
async function strategyNode(state: KalizaAgentState, checkpoint?: ExecutionCheckpoint): Promise<Partial<KalizaAgentState>> {
  await checkExecution(checkpoint);
  logger.info('Strategy agent working', { taskId: state.task_id });
  const strategyText = await callAgentModel(
    state,
    `You are the Kaliza Strategy agent. Evaluate research and develop an execution strategy. Identify risks and approval requirements.`,
    `Objective: ${state.objective}\nResearch: ${state.research_findings}\nPlan: ${state.plan}`,
    'reasoning',
  );
  return { current_phase: 'execution', strategy: strategyText, messages: ['[strategy] Developed strategy'] };
}

// ===== Execution =====
async function executionNode(state: KalizaAgentState, checkpoint?: ExecutionCheckpoint): Promise<Partial<KalizaAgentState>> {
  await checkExecution(checkpoint);
  logger.info('Execution agent working', { taskId: state.task_id });
  const results: string[] = [];
  let sandboxId = state.sandbox_id;

  if (!sandboxId) {
    try {
      await checkExecution(checkpoint);
      const sandbox = await provisionSandbox({ workspace_id: state.workspace_id, task_id: state.task_id });
      sandboxId = sandbox.id;
    } catch (err) {
      logger.warn('Sandbox provisioning failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (sandboxId) {
    try {
      await checkExecution(checkpoint);
      const creds = await getWorkspaceScopedCredentials(state.workspace_id, state.task_id);
      for (const [key, value] of Object.entries(creds)) {
        await checkExecution(checkpoint);
        await setSandboxEnvVar({ sandbox_id: sandboxId, key, value });
      }

      await checkExecution(checkpoint);
      const result = await executeInSandbox({ sandbox_id: sandboxId, command: 'echo "Kaliza agent environment ready" && uname -a' });
      results.push(`Sandbox: exit=${result.exit_code}, stdout=${result.stdout}`);

      if (state.service_id === 'business-growth') {
        await checkExecution(checkpoint);
        const scriptResult = await runAgentScript({
          sandbox_id: sandboxId,
          language: 'python',
          script: `import json\nresult = {"status": "analyzing", "objective": "${state.objective.replace(/"/g, '\\"')}"}\nprint(json.dumps(result))`,
          timeout_ms: 30000,
        });
        results.push(`Business analysis script: exit=${scriptResult.exit_code}, output=${scriptResult.stdout}`);
      }
    } catch (err) {
      if (err instanceof AgentRunCancelledError) throw err;
      results.push(`Sandbox error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await checkExecution(checkpoint);
  const execResult = await callAgentModel(
    state,
    `You are the Kaliza Execution agent. Carry out approved actions through the tool gateway. Report if approval is needed for high-risk actions like publishing, spending, or sending external messages.`,
    `Objective: ${state.objective}\nStrategy: ${state.strategy}\nSandbox: ${sandboxId ? 'yes' : 'no'}\nSandbox results: ${results.join('\n')}`,
    'reasoning',
  );
  results.push(execResult);

  return { current_phase: 'content', execution_results: results, sandbox_id: sandboxId, messages: ['[execution] Completed'] };
}

// ===== Content =====
async function contentNode(state: KalizaAgentState, checkpoint?: ExecutionCheckpoint): Promise<Partial<KalizaAgentState>> {
  await checkExecution(checkpoint);
  logger.info('Content agent working', { taskId: state.task_id });
  const deliverable = await callAgentModel(
    state,
    `You are the Kaliza Content agent. Produce final deliverables. Do not publish or send external communications without authorization.`,
    `Objective: ${state.objective}\nResearch: ${state.research_findings}\nStrategy: ${state.strategy}\nExecution: ${state.execution_results.join('\n')}`,
    'content',
  );
  return { current_phase: 'review', content_deliverables: [deliverable], messages: ['[content] Produced deliverables'] };
}

// ===== Review =====
async function reviewNode(state: KalizaAgentState, checkpoint?: ExecutionCheckpoint): Promise<Partial<KalizaAgentState>> {
  await checkExecution(checkpoint);
  logger.info('Review agent working', { taskId: state.task_id });
  const reviewText = await callAgentModel(
    state,
    `You are the Kaliza Review agent. Check results against the objective. Respond with PASS or FAIL and a summary.`,
    `Objective: ${state.objective}\nDeliverables: ${state.content_deliverables.join('\n')}\nExecution: ${state.execution_results.join('\n')}`,
    'reasoning',
  );
  return { current_phase: 'review', review_result: reviewText, messages: [`[review] ${reviewText.substring(0, 100)}`] };
}

// ===== Routing =====
function routeAfterSupervisor(state: KalizaAgentState): string {
  if (state.current_phase === 'end' || state.status === AgentRunStatus.COMPLETED || state.status === AgentRunStatus.FAILED) return END;
  if (state.current_phase === 'planning') return 'planning_agent';
  if (state.current_phase === 'review') return 'review_agent';
  return 'planning_agent';
}

// ===== Build =====
function buildGraph(checkpoint?: ExecutionCheckpoint) {
  const graph = new StateGraph(AgentState)
    .addNode('supervisor', (state) => supervisorNode(state, checkpoint))
    .addNode('planning_agent', (state) => planningNode(state, checkpoint))
    .addNode('research_agent', (state) => researchNode(state, checkpoint))
    .addNode('strategy_agent', (state) => strategyNode(state, checkpoint))
    .addNode('execution_agent', (state) => executionNode(state, checkpoint))
    .addNode('content_agent', (state) => contentNode(state, checkpoint))
    .addNode('review_agent', (state) => reviewNode(state, checkpoint))
    .addEdge(START, 'supervisor')
    .addConditionalEdges('supervisor', routeAfterSupervisor)
    .addEdge('planning_agent', 'research_agent')
    .addEdge('research_agent', 'strategy_agent')
    .addEdge('strategy_agent', 'execution_agent')
    .addEdge('execution_agent', 'content_agent')
    .addEdge('content_agent', 'review_agent')
    .addEdge('review_agent', 'supervisor');
  return graph;
}

export function buildAgentGraph() {
  return buildGraph().compile();
}

export function buildAgentGraphWithCheckpoint(workspaceId: string, checkpoint?: ExecutionCheckpoint) {
  const checkpointer = new SupabaseCheckpointSaver(workspaceId);
  return buildGraph(checkpoint).compile({ checkpointer });
}
