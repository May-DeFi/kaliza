import { ServiceId, TaskStatus, type TaskStatusValue } from '../../config/constants.js';
import type { CreateRunInput } from '../../domain/agents/orchestrator.js';
import { createTask, transitionTask, getTask } from '../../domain/tasks/task-service.js';
import { createAgentRun, listTaskAgentRuns } from '../../domain/agents/agent-run-service.js';
import { callModel } from '../../domain/models/model-gateway.js';
import { evaluatePolicy } from '../../domain/policies/policy-engine.js';
import { createApproval } from '../../domain/approvals/approval-service.js';
import { notifyTaskEvent } from '../../domain/notifications/notification-service.js';
import { recordUsage } from '../../domain/usage/usage-service.js';
import { recordAuditEvent } from '../../domain/audit/audit-service.js';
import { logger } from '../../config/logger.js';
import { ForbiddenError } from '../../api/middleware/errors.js';

export const SERVICE_ID = ServiceId.BUSINESS_GROWTH;

export const CAPABILITIES = {
  ONLINE_PRESENCE: 'online_presence',
  ADVERTISING: 'advertising_management',
  PROSPECT_DISCOVERY: 'prospect_discovery',
  SALES_OPERATIONS: 'sales_operations',
  WORKFLOW_AUTOMATION: 'workflow_automation',
  ANALYTICS: 'analytics',
} as const;

export const WORKFLOW_DEFINITIONS = [
  {
    definition_id: 'bg-content-plan',
    version: 1,
    name: 'Social Content Planning & Publishing',
    capability: CAPABILITIES.ONLINE_PRESENCE,
    steps: ['retrieve_brand_profile', 'research_topics', 'create_calendar', 'draft_content', 'await_review', 'publish'],
    approval_points: ['publish'],
  },
  {
    definition_id: 'bg-ads-management',
    version: 1,
    name: 'Ads Campaign Management',
    capability: CAPABILITIES.ADVERTISING,
    steps: ['research_audience', 'plan_campaign', 'create_draft', 'await_approval', 'activate', 'monitor', 'report'],
    approval_points: ['activate'],
  },
  {
    definition_id: 'bg-prospect-discovery',
    version: 1,
    name: 'Prospect Discovery & Outreach',
    capability: CAPABILITIES.PROSPECT_DISCOVERY,
    steps: ['define_icp', 'research_prospects', 'qualify_leads', 'draft_outreach', 'await_approval', 'send_outreach', 'track_responses'],
    approval_points: ['send_outreach'],
  },
  {
    definition_id: 'bg-sales-ops',
    version: 1,
    name: 'Sales & Customer Operations',
    capability: CAPABILITIES.SALES_OPERATIONS,
    steps: ['intake_inquiry', 'triage', 'draft_response', 'route_or_respond', 'track_followup'],
    approval_points: [],
  },
  {
    definition_id: 'bg-workflow-automation',
    version: 1,
    name: 'Business Workflow Automation',
    capability: CAPABILITIES.WORKFLOW_AUTOMATION,
    steps: ['discover_workflow', 'map_process', 'propose_automation', 'await_confirmation', 'implement', 'run_with_checkpoints'],
    approval_points: ['implement'],
  },
  {
    definition_id: 'bg-analytics',
    version: 1,
    name: 'Analytics & Performance Reporting',
    capability: CAPABILITIES.ANALYTICS,
    steps: ['gather_metrics', 'analyze_trends', 'generate_report', 'deliver'],
    approval_points: [],
  },
];

export interface BusinessGrowthTaskInput {
  workspace_id: string;
  user_id: string;
  conversation_id?: string;
  objective: string;
  capability?: string;
  task_id?: string;
  idempotency_key?: string;
}

export async function startBusinessGrowthTask(input: BusinessGrowthTaskInput): Promise<{
  task_id: string;
  agent_run_id: string;
  status: string;
}> {
  const task = input.task_id
    ? await getTask(input.task_id)
    : await createTask({
        workspace_id: input.workspace_id,
        service_id: SERVICE_ID,
        conversation_id: input.conversation_id,
        objective: input.objective,
        user_id: input.user_id,
        idempotency_key: input.idempotency_key,
      });

  if (task.workspace_id !== input.workspace_id) {
    throw new ForbiddenError('Task does not belong to the supplied workspace');
  }

  if (task.user_id && task.user_id !== input.user_id) {
    throw new ForbiddenError('Task is owned by a different user');
  }

  const existingRuns = await listTaskAgentRuns(task.id);
  const activeRun = existingRuns.find((run) => [
    'CREATED',
    'RUNNING',
    'PAUSED',
    'AWAITING_APPROVAL',
    'AWAITING_INPUT',
  ].includes(run.status));

  if (activeRun) {
    return { task_id: task.id, agent_run_id: activeRun.id, status: activeRun.status };
  }

  const taskStatus = task.status as TaskStatusValue;
  if (taskStatus === TaskStatus.RECEIVED) {
    await transitionTask(task.id, TaskStatus.CLASSIFIED, 'system', `Classified as Business Growth task`);
  }

  if (taskStatus === TaskStatus.CLASSIFIED || taskStatus === TaskStatus.RECEIVED) {
    await transitionTask(task.id, TaskStatus.PLANNED, 'system', 'Task planned, agent run started');
  }

  const { agentRun } = await createAgentRun({
    task_id: task.id,
    workspace_id: input.workspace_id,
    user_id: input.user_id,
    service_id: SERVICE_ID,
    objective: input.objective,
    tool_allowlist: ['research_web', 'generate_content', 'send_whatsapp', 'publish_meta', 'manage_ads'],
    budget_limit_tokens: 50000,
  });

  await notifyTaskEvent({
    workspace_id: input.workspace_id,
    user_id: input.user_id,
    task_id: task.id,
    event: 'started',
    message: `I'm working on: ${input.objective}`,
  });

  await recordAuditEvent({
    workspace_id: input.workspace_id,
    actor: input.user_id,
    action: 'business_growth.task_started',
    target: 'task',
    target_id: task.id,
    metadata: { capability: input.capability, agent_run_id: agentRun.id },
  });

  return { task_id: task.id, agent_run_id: agentRun.id, status: 'PLANNED' };
}

export async function classifyObjective(objective: string): Promise<{ capability: string; workflow_id: string }> {
  const response = await callModel({
    workspace_id: 'system',
    task_type: 'classification',
    prompt: `Classify this business objective into one of these capabilities: ${Object.values(CAPABILITIES).join(', ')}.\nObjective: ${objective}\nRespond with just the capability name.`,
    max_tokens: 50,
    temperature: 0.3,
  });

  const capability = Object.values(CAPABILITIES).find((c) => response.content.includes(c)) ?? CAPABILITIES.ONLINE_PRESENCE;
  const workflow = WORKFLOW_DEFINITIONS.find((w) => w.capability === capability) ?? WORKFLOW_DEFINITIONS[0];

  return { capability, workflow_id: workflow.definition_id };
}

export async function generateContentPlan(input: {
  workspace_id: string;
  task_id: string;
  user_id: string;
  brandContext: string;
}): Promise<string> {
  const response = await callModel({
    workspace_id: input.workspace_id,
    task_id: input.task_id,
    task_type: 'content',
    prompt: `Create a weekly content plan for this business: ${input.brandContext}\nInclude post topics, captions, and suggested posting days.`,
    max_tokens: 1500,
    temperature: 0.7,
  });

  await recordUsage({
    workspace_id: input.workspace_id,
    category: 'model_tokens',
    quantity: response.input_tokens + response.output_tokens,
    unit: 'tokens',
    cost: response.cost,
    task_id: input.task_id,
  });

  return response.content;
}

export async function requestApprovalForAction(input: {
  workspace_id: string;
  task_id: string;
  user_id: string;
  action: string;
  payload: Record<string, unknown>;
}): Promise<string> {
  const task = await getTask(input.task_id);
  if (task.workspace_id !== input.workspace_id) {
    throw new ForbiddenError('Task does not belong to the supplied workspace');
  }
  if (task.user_id && task.user_id !== input.user_id) {
    throw new ForbiddenError('Task is owned by a different user');
  }

  const policyResult = evaluatePolicy({
    workspace_id: input.workspace_id,
    user_id: input.user_id,
    role: 'OWNER',
    action: input.action,
  });

  if (!policyResult.approval_required) {
    logger.info('Action does not require approval', { action: input.action, risk: policyResult.risk_class });
    return '';
  }

  const approval = await createApproval({
    task_id: input.task_id,
    workspace_id: input.workspace_id,
    risk: policyResult.risk_class,
    payload: { action: input.action, ...input.payload },
  });

  await transitionTask(input.task_id, 'AWAITING_APPROVAL', 'system', `Awaiting approval for: ${input.action}`);

  await notifyTaskEvent({
    workspace_id: input.workspace_id,
    user_id: input.user_id,
    task_id: input.task_id,
    event: 'needs_approval',
    message: `I need your approval to: ${input.action}. Please review and approve.`,
  });

  return approval.id;
}

export async function completeBusinessGrowthTask(input: {
  task_id: string;
  workspace_id: string;
  user_id: string;
  result: string;
}): Promise<void> {
  await transitionTask(input.task_id, 'VERIFYING', 'system', 'Verifying task results');

  await transitionTask(input.task_id, 'COMPLETED', 'system', 'Task completed successfully');

  await notifyTaskEvent({
    workspace_id: input.workspace_id,
    user_id: input.user_id,
    task_id: input.task_id,
    event: 'completed',
    message: `Task completed: ${input.result}`,
  });

  await recordAuditEvent({
    workspace_id: input.workspace_id,
    actor: input.user_id,
    action: 'business_growth.task_completed',
    target: 'task',
    target_id: input.task_id,
    outcome: 'SUCCESS',
  });
}
