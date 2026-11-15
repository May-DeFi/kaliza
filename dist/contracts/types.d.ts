import type { TaskStatusValue, RiskClassValue, PolicyDecisionValue, ApprovalStatusValue, SandboxStatusValue, AgentRunStatusValue } from '../config/constants.js';
export type { TaskStatusValue, RiskClassValue, PolicyDecisionValue, ApprovalStatusValue, SandboxStatusValue, AgentRunStatusValue, };
export interface BaseEntity {
    id: string;
    created_at: string;
    updated_at: string;
}
export interface User extends BaseEntity {
    auth_subject: string | null;
    email: string | null;
    phone: string | null;
    full_name: string | null;
    status: string;
    profile: Record<string, unknown> | null;
}
export interface Organization extends BaseEntity {
    name: string;
    status: string;
    owner_id: string | null;
}
export interface Workspace extends BaseEntity {
    tenant_id: string;
    name: string;
    type: string;
    status: string;
    settings: Record<string, unknown> | null;
}
export interface Membership extends BaseEntity {
    user_id: string;
    workspace_id: string;
    role: string;
    permissions: string[] | null;
}
export interface ServiceEntitlement extends BaseEntity {
    workspace_id: string;
    service_id: string;
    plan: string;
    status: string;
    limits: Record<string, unknown> | null;
}
export interface Conversation extends BaseEntity {
    workspace_id: string;
    channel: string;
    external_thread_id: string | null;
    status: string;
    user_id: string | null;
}
export interface Message extends BaseEntity {
    conversation_id: string;
    direction: string;
    content: string | null;
    content_type: string;
    attachments: Record<string, unknown>[] | null;
    provider_message_id: string | null;
    delivery_state: string | null;
}
export interface Task extends BaseEntity {
    workspace_id: string;
    service_id: string | null;
    conversation_id: string | null;
    objective: string;
    status: TaskStatusValue;
    priority: number;
    idempotency_key: string | null;
    version: number;
    user_id: string | null;
}
export interface TaskStep extends BaseEntity {
    task_id: string;
    sequence: number;
    step_type: string;
    status: string;
    input_ref: string | null;
    output_ref: string | null;
    metadata: Record<string, unknown> | null;
}
export interface TaskTransition extends BaseEntity {
    task_id: string;
    from_status: string;
    to_status: string;
    actor: string;
    reason: string | null;
    task_version: number;
    run_reference: string | null;
}
export interface WorkflowRun extends BaseEntity {
    task_id: string;
    definition_id: string;
    definition_version: number;
    state: string;
    checkpoint: Record<string, unknown> | null;
    attempt: number;
}
export interface AgentRun extends BaseEntity {
    task_id: string;
    orchestrator: string;
    external_run_id: string | null;
    status: AgentRunStatusValue;
    trace_metadata: Record<string, unknown> | null;
}
export interface Approval extends BaseEntity {
    task_id: string;
    action_hash: string;
    action_version: number;
    risk: RiskClassValue;
    payload: Record<string, unknown>;
    decision: ApprovalStatusValue;
    approver_id: string | null;
    decided_at: string | null;
    expiry: string | null;
    workspace_id: string;
}
export interface IntegrationConnection extends BaseEntity {
    workspace_id: string;
    provider: string;
    account_identifier: string | null;
    account_name: string | null;
    encrypted_credentials: string | null;
    scopes: string[] | null;
    status: string;
    connection_type: string;
}
export interface ProviderAsset extends BaseEntity {
    connection_id: string;
    asset_type: string;
    provider_asset_id: string;
    display_name: string | null;
    metadata: Record<string, unknown> | null;
    selected: boolean;
}
export interface ToolInvocation extends BaseEntity {
    task_id: string | null;
    agent_run_id: string | null;
    tool_id: string;
    tool_version: string;
    input_hash: string | null;
    output_ref: string | null;
    status: string;
    duration_ms: number | null;
    workspace_id: string;
}
export interface SandboxInstance extends BaseEntity {
    workspace_id: string;
    task_id: string | null;
    daytona_id: string | null;
    image: string;
    status: SandboxStatusValue;
    lease_expiry: string | null;
    resource_limits: Record<string, unknown> | null;
    last_activity: string | null;
}
export interface FileAsset extends BaseEntity {
    workspace_id: string;
    object_key: string;
    mime_type: string;
    size_bytes: number;
    checksum: string | null;
    source: string;
    access_policy: string;
    task_id: string | null;
}
export interface UsageEvent extends BaseEntity {
    workspace_id: string;
    category: string;
    quantity: number;
    unit: string;
    cost: number | null;
    task_id: string | null;
    agent_run_id: string | null;
}
export interface Subscription extends BaseEntity {
    workspace_id: string;
    plan: string;
    status: string;
    billing_state: string;
    limits: Record<string, unknown> | null;
}
export interface AuditEvent extends BaseEntity {
    workspace_id: string | null;
    actor: string;
    action: string;
    target: string | null;
    target_id: string | null;
    correlation_id: string | null;
    outcome: string;
    metadata: Record<string, unknown> | null;
}
export interface WebhookEvent extends BaseEntity {
    provider: string;
    event_id: string;
    event_type: string;
    processed: boolean;
    payload_ref: string | null;
}
export interface PolicyEvaluation {
    decision: PolicyDecisionValue;
    reason: string;
    policy_version: string;
    risk_class: RiskClassValue;
    approval_required: boolean;
}
export interface ApiError {
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
    request_id: string;
}
export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        per_page: number;
        total: number;
        has_more: boolean;
    };
}
export interface ApiSuccess<T> {
    data: T;
    request_id: string;
}
//# sourceMappingURL=types.d.ts.map