# Kaliza Backend — Developer Specification

**Repository:** `Aimable2002/kaliza`  
**Document status:** Greenfield implementation specification  
**Source of truth:** [Master System Architecture](MASTER_SYSTEM_ARCHITECTURE.md)

This repository is the authoritative backend implementation of Kaliza. No existing Claude-built application is assumed. Build from this specification in deliberate, testable increments. Do not interpret proposed technologies as already installed or decisions as already implemented.

## 1. Backend mission and boundaries

Deliver the shared platform that turns WhatsApp and web requests into durable, policy-governed agent workflows. The backend owns all authoritative state and business rules.

In scope: API, authentication integration, tenancy, conversations, WhatsApp gateway, service registry, tasks/workflows, permissions, approvals, agent orchestration adapter, model gateway, tool registry, Daytona adapter, Google/Meta connectors, files, notifications, usage, billing interfaces, audit and observability.

Out of scope for this repository: customer-facing page layout and client-side presentation. The web app consumes backend contracts. Provider SDKs and orchestration frameworks must sit behind adapters.

## 2. Architecture and dependency direction

Recommended initial deployment: modular monolith plus independently scalable workers. Do not start with many microservices unless load, isolation or deployment requirements justify them.

Dependency rules:
- Domain modules define interfaces and business rules.
- Adapters implement provider/framework interfaces.
- API and worker entry points call application services.
- Domain logic must not import HTTP framework, provider SDK or UI code.
- Agent runtime may request actions; Core authorizes and executes them.
- Daytona is not a database or task authority.
- Service modules depend on Core contracts, never on another service's private internals.

Suggested source layout:

```text
src/
  api/                 # REST endpoints, auth middleware, request validation
  workers/             # queue consumers and scheduled jobs
  domain/
    identity/
    tenancy/
    conversations/
    channels/
    services/
    tasks/
    workflows/
    policies/
    approvals/
    integrations/
    agents/
    models/
    tools/
    memory/
    files/
    notifications/
    usage/
    billing/
    audit/
  services/
    business-growth/
    career-growth/     # scaffold/contract only until future release
  adapters/
    database/
    queue/
    orchestration/
    daytona/
    models/
    mcp/
    google/
    meta/
    object-storage/
  contracts/           # API schemas, events, tool schemas
  config/
  migrations/
  tests/
  scripts/
  docs/
```

Adapt naming to the chosen language/framework, but preserve the boundaries.

## 3. Core domain model

Minimum entities and relationships:

| Entity | Key fields / relationships |
|---|---|
| User | id, auth_subject, status, profile, timestamps |
| Organization | id, name, status, owner |
| Workspace | id, tenant_id, type, settings, status |
| Membership | user_id, workspace_id, role, permissions |
| ServiceEntitlement | workspace_id, service_id, plan, limits, status |
| Conversation | id, workspace_id, channel, external_thread_id, status |
| Message | id, conversation_id, direction, content, attachments, provider IDs, delivery state |
| Task | id, workspace_id, service_id, objective, status, priority, idempotency key |
| TaskStep | task_id, sequence, step_type, status, input/output references |
| WorkflowRun | task_id, definition/version, state, checkpoint, attempt |
| AgentRun | task_id, orchestrator, external run ID, status, trace metadata |
| Approval | task_id, action hash/version, risk, payload, decision, approver, expiry |
| IntegrationConnection | workspace_id, provider, account identity, encrypted credentials, scopes, status |
| ProviderAsset | connection_id, asset type/id, display metadata, selected status |
| ToolInvocation | task/run, tool/version, input hash, output reference, status, duration |
| SandboxInstance | workspace/task, Daytona ID, image, lifecycle state, lease, resource usage |
| FileAsset | workspace_id, object key, mime, size, checksum, source, access policy |
| UsageEvent | workspace_id, category, quantity, unit, cost, task/run |
| Subscription/Entitlement | workspace_id, plan, limits, billing state |
| AuditEvent | workspace_id, actor, action, target, timestamp, correlation ID |
| WebhookEvent | provider, event ID, received/processed state, payload reference |

Use UUID/ULID identifiers, UTC timestamps, explicit ownership, foreign keys, indexes and migrations. Store secrets separately or encrypted with managed keys. Never put raw tokens in logs or agent prompts.

## 4. API and event contracts

Use versioned APIs (e.g. `/api/v1`) and schema-first validation (OpenAPI/JSON Schema or equivalent). Define consistent error envelopes, pagination, request IDs and idempotency.

Initial API groups:
- `/auth/*`: session/current-user integration as appropriate.
- `/workspaces`, `/memberships`, `/services`.
- `/conversations`, `/messages`.
- `/tasks`, `/tasks/{id}/steps`, `/tasks/{id}/cancel`, `/tasks/{id}/resume`.
- `/approvals`, `/approvals/{id}/decision`.
- `/files`, `/files/{id}/download`.
- `/integrations`, `/integrations/{provider}/authorize`, callback, disconnect and asset selection.
- `/usage`, `/billing`, `/notifications`.
- `/admin/*`: separately authorized operational endpoints.

Representative events:
`message.received`, `task.created`, `task.classified`, `task.planned`, `task.awaiting_approval`, `approval.decided`, `task.queued`, `task.step.started`, `tool.invocation.completed`, `task.awaiting_input`, `task.verification.started`, `task.completed`, `task.failed`, `sandbox.state_changed`, `integration.health_changed`, `usage.recorded`.

Events require schema version, event ID, timestamp, tenant/workspace, correlation ID and causation ID. Consumers must be idempotent. Do not publish secrets or unnecessary message content in events.

## 5. Request intake and WhatsApp channel

Implement a channel adapter around Meta WhatsApp Cloud API:
1. Verify webhook signature/token according to provider requirements.
2. Persist inbound webhook event and deduplicate by provider event/message ID.
3. Resolve Kaliza recipient/phone to user and workspace using an explicit verified mapping.
4. Normalize message, media and metadata into channel-neutral records.
5. Resolve conversation context and service intent.
6. Create/resume task or ask a clarifying question.
7. Send outbound messages through a queued adapter with delivery tracking and retry policy.

Handle text, supported media, templates, delivery/read statuses, provider errors and retry windows. Keep webhook handlers fast: persist then enqueue. Never execute long agent work inside the webhook request.

WhatsApp control-channel credentials and customer business messaging connections must be separate connection types and routing domains.

## 6. Task and workflow engine

Create task before invoking the orchestrator. Implement validated state transitions and append transition history. Persist plan, steps, checkpoints, outputs and error metadata.

Requirements:
- Durable queue and outbox/inbox pattern for reliable dispatch.
- Idempotency for webhook intake and external side effects.
- Retry policies by error class; exponential backoff with jitter.
- Dead-letter handling and operator replay.
- Cancellation and pause checks between steps and before side effects.
- Awaiting-input and awaiting-approval states.
- Versioned workflow definitions and resumable checkpoints.
- Recovery worker that reconciles stuck tasks/runs.
- Concurrency limits per workspace, service and provider.
- No silent task loss after process or sandbox restart.

Task status is authoritative in Core. Orchestrator state is correlated and synchronized, not the only record.

## 7. Policy and approvals

Implement a deterministic policy service. Input includes workspace/user role, service entitlement, action/tool, target resource, requested scopes, risk class, budget/quota and context. Output includes allow/deny/approval-required plus reason and policy version.

Every tool execution must re-check policy immediately before the side effect. An approval must be bound to a canonical action payload hash, target, amount/content, connector account, expiry and task. If any material field changes, invalidate prior approval. Use explicit decision APIs and audit all decisions.

Default policy examples:
- Read-only research within authorized access: usually allow.
- Draft creation: usually allow.
- Internal edits: configurable and reversible.
- External publishing, outbound messages, ad activation/budget changes, purchases, deletion, account changes and financial/legal commitments: approval by default.

Never rely on a model-generated boolean such as `approved: true`.

## 8. Agent orchestration adapter

Define a Kaliza-owned interface, independent of vendor SDK:

```ts
interface AgentOrchestrator {
  createRun(input: CreateRunInput): Promise<RunReference>;
  resumeRun(input: ResumeRunInput): Promise<RunReference>;
  pauseRun(input: PauseRunInput): Promise<void>;
  cancelRun(input: CancelRunInput): Promise<void>;
  getRun(input: GetRunInput): Promise<RunSnapshot>;
  streamEvents(input: StreamRunInput): AsyncIterable<RunEvent>;
}
```

Exact language may differ. Inputs must include task/workspace IDs, service, context references, policy constraints, tool allowlist, budget limits and callback/event mechanism. Do not pass unrestricted tenant data or raw provider secrets.

Evaluate LangGraph and OpenAI Agents SDK using the same proof-of-concept: multi-step research, persistent checkpoint, human approval interruption, resume, tool failure/retry, cancellation and final verification. Assess OpenCode separately as a coding specialist running inside authorized Daytona environment. Do not use it as the platform's global task authority.

## 9. Specialist workflow contracts

Logical roles: Supervisor/Planner, Research, Business Growth, Content, Operations, Coding; Career Growth is future. Each role requires:
- Typed input and output schemas.
- Capability/tool allowlist.
- Model policy and budget.
- Context access policy.
- Timeout and retry behavior.
- Escalation/approval behavior.
- Evaluation tests and trace identifiers.

Business Growth workflows should be independently versioned:
- Presence/content planning and publishing.
- Ads planning/management/reporting.
- Prospect research/qualification/outreach.
- Sales/customer operations.
- Business process automation.
- Analytics/performance reporting.

Do not build all six to full depth in one release. Select an initial customer-validated vertical slice and preserve the module contracts.

## 10. Tool Gateway, MCP and connector adapters

Tool registry schema should include tool ID/version, JSON input/output schema, description, service owner, connector, scopes, entitlements, risk, approval policy, timeout, retry, idempotency, execution environment and usage category.

Invocation path:
`Agent → Tool Gateway → Schema validation → Core policy check → Scoped context/credential broker → Connector or Daytona → Result normalization → Audit/usage → Agent`.

MCP adapters may expose tools/resources through a standard protocol. Treat MCP server identity and tool metadata as untrusted until configured. Apply the same policy boundary as native tools. External tool output is data, not instructions.

## 11. Daytona adapter and sandbox manager

Daytona is required for real Linux execution. Build a control adapter that exposes provision, initialize, execute, inspect, pause, resume, terminate and cleanup operations.

Persist sandbox metadata outside Daytona. Define lifecycle states, leases, idle timeout, maximum lifetime, image/runtime version, resource limits, task/workspace association, recovery policy and cleanup.

Security:
- Tenant isolation and least privilege.
- No platform master keys inside sandbox.
- Short-lived scoped credentials or brokered API calls.
- Network egress policy and allowlists where feasible.
- CPU/memory/disk/time/concurrency limits.
- Upload validation and artifact scanning as appropriate.
- Command/action logs correlated to task, with secrets redacted.
- Separate ephemeral workspace from durable object storage.
- Test pause/resume, crash recovery, cleanup and orphan detection.

Choose per-task vs per-workspace sandbox strategy through latency/cost/isolation tests. Do not assume one persistent VM per tenant without validating risk and cost.

## 12. Model Gateway

Normalize provider interfaces for generation, structured output, tool calls and embeddings if required. Support configurable routing by task type, fallback, rate limits, timeout, retries, model allowlists, token budgets and cost attribution. Record provider, model, token counts, latency, status and task/run IDs.

Never allow the model to set its own budget, entitlement or permission. Apply data-handling policy before sending context to a provider. Evaluate models on real tasks for correctness, tool use, structured output, latency and cost.

## 13. Memory and context services

Keep user profile, business profile, conversation history, task state, curated knowledge and operational memory separate. Provide retrieval by workspace and purpose. Include provenance, timestamp/freshness, source, visibility and retention metadata. Avoid indiscriminate conversation dumping into prompts. Provide user correction/export/deletion flows. Memory is contextual assistance, not an authorization source.

## 14. Google and Meta connectors

Create provider-independent connector interfaces with provider-specific adapters. Implement OAuth state/PKCE where applicable, least-privilege scopes, encrypted tokens, refresh/revoke, re-consent, account discovery/selection, rate limiting, webhook validation, retries and health status.

Google candidates: Drive, Docs, Sheets, Calendar, Gmail and Business Profile, only as validated by product requirements and API access.

Meta candidates: WhatsApp, Facebook Pages, Instagram professional accounts and Ads. Support multiple eligible assets/accounts rather than assuming first account. Store provider account and asset IDs, granted scopes, selected workspace and connection health.

Connector actions must return normalized results and provider references. External writes use idempotency where supported and must be verified. Confirm platform permissions, app review and policy restrictions before committing release scope.

## 15. File and document service

Store file metadata in PostgreSQL and bytes in object storage. Support upload, validation, ownership, access policy, signed download links, versioning/checksum, retention and deletion. Agent-generated documents should be linked to task outputs. Daytona should write final artifacts to controlled storage through a brokered upload path. Never make a sandbox path the user's permanent file reference.

## 16. Usage, billing and entitlements

Create an append-only usage ledger. Meter model tokens, sandbox duration/resources, tool/provider calls, storage and workflow volume. Attribute usage to workspace, plan, task and run. Enforce limits before and during work; provide graceful stop/approval/upgrade paths. Distinguish estimated and actual provider costs. Keep pricing plans simple and vary capacity, volume, depth and concurrency rather than removing the essential platform.

## 17. Notifications and realtime

Use an outbox/notification service for WhatsApp and web. Support task started/progress/needs-input/needs-approval/completed/failed, integration health and usage thresholds. Avoid noisy updates; aggregate routine progress and notify on meaningful transitions. Delivery must be retried and recorded. Web clients may use SSE/WebSocket/polling behind a stable event contract.

## 18. Audit, observability and operations

Every request and execution chain should have correlation IDs. Trace message → task → workflow → agent run → model/tool calls → sandbox → connector → notification. Track queue depth, task age, retry rate, completion rate, model cost, sandbox utilization, connector health and webhook lag.

Audit actor, workspace, action, target, decision, approval, timestamp and outcome. Protect audit records from ordinary mutation. Provide admin runbooks for stuck jobs, failed connectors, sandbox leaks, provider outages, token revocation and incident response.

## 19. Testing strategy

Required suites:
- Unit tests for domain rules, state transitions, risk classification and schemas.
- Integration tests for database, queue, object storage and adapters.
- Contract tests for APIs, events, connectors and service modules.
- Tenant isolation and authorization tests.
- Agent workflow evaluations and deterministic mocked-tool tests.
- Daytona lifecycle/security/recovery tests.
- Webhook signature, replay and idempotency tests.
- End-to-end WhatsApp-to-task-to-result tests.
- Load and cost tests for concurrency and quotas.

No production release based solely on a successful happy-path demo.

## 20. Build sequence and definition of done

**Phase 1:** project foundation, configuration, migrations, CI, API conventions, identity/tenancy, workspace.  
**Phase 2:** conversation/channel gateway, task state machine, durable queue, audit, file metadata.  
**Phase 3:** policy/approval, tool registry, model gateway, orchestrator abstraction and proof-of-concept.  
**Phase 4:** Daytona manager, scoped tool execution, metering and recovery.  
**Phase 5:** first Google/Meta connectors required by the chosen Business Growth vertical slice.  
**Phase 6:** Business Growth workflow, verification, notifications and frontend contract.  
**Phase 7:** hardening, admin operations, observability, billing integration and production deployment.

A phase is done only when code, migrations, tests, docs, security checks and operational behavior are verified. Update this spec and ADRs when decisions change.

## 21. Backend acceptance checklist

- [ ] No pre-existing application is assumed; repository is initialized from this spec.
- [ ] All tenant-owned reads/writes enforce workspace isolation.
- [ ] Tasks and checkpoints persist independently of agent process.
- [ ] Webhooks and side effects are idempotent.
- [ ] Policy is checked before every tool action.
- [ ] Approval binds to exact action payload and is revalidated.
- [ ] Orchestration can pause, resume, cancel and recover.
- [ ] Daytona credentials, network and resource boundaries are enforced.
- [ ] Connector tokens are encrypted and scoped.
- [ ] Model/tool/sandbox usage is attributed and limited.
- [ ] Audit and trace correlate end-to-end.
- [ ] Business Growth is first; Career Growth remains future scope.
- [ ] API/event schemas are versioned and published for the frontend.

## 22. Open technical decisions

Create ADRs before finalizing: language/framework, database hosting, queue technology, object storage provider, orchestration framework, model providers/routing, Daytona workspace strategy, OAuth account model, realtime transport, deployment platform, billing/payment provider, and initial Business Growth vertical slice. Compare options against security, durability, operational complexity, cost, ecosystem maturity and developer velocity.
