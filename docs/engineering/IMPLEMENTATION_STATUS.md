# Kaliza implementation status

## Phase 1 corrective review

- Branch: `copilot/implementation-takeover`
- Reviewed starting commit: `f13ec5415c08ef96c19ff7f919989e20f20a01be`
- Scope: backend correctness and reliability defects only. No Phase 2 work was started.
- Verification labels: `IMPLEMENTED` describes code changes; `AUTOMATED-TESTED` describes local tests; `MOCK-VERIFIED` means persistence/Temporal behavior was simulated; `LIVE-VERIFIED` requires a live service; `BLOCKED` means required live infrastructure was unavailable.

## A. User identity propagation

- Original problem: callers could supply a user ID in the agent-run API body, and service-role run creation did not independently verify task ownership.
- Root cause: API identity was treated as request data rather than the authenticated principal.
- Files changed: `src/api/routes/agent-run-routes.ts`, `src/domain/agents/agent-run-service.ts`
- Implemented: the route takes identity from authenticated middleware; run creation checks task workspace and owner and requires workspace membership before reusing or creating a run.
- Tests: business-growth ownership regressions and concurrent-run service tests; the route itself has no dedicated HTTP integration test.
- Commands/results: `npm test` — see final verification section; typecheck, lint, and build results are recorded there after execution.
- Limitations: no live authenticated API/Supabase test.
- Status: IMPLEMENTED; AUTOMATED-TESTED at service/business-flow level; LIVE-VERIFIED: BLOCKED.

## B. Agent-run idempotency and concurrency

- Original problem: read-then-insert run creation allowed concurrent requests to create duplicate active runs; retries could also reuse an old task-wide Temporal workflow ID.
- Root cause: no database uniqueness invariant existed, and workflow IDs were task-scoped rather than run-scoped.
- Files changed: `supabase/migrations/20261116090000_008_agent_run_active_uniqueness.sql`, `src/domain/agents/agent-run-service.ts`, `src/domain/agents/orchestrator.ts`, `src/adapters/orchestration/temporal-orchestrator.ts`
- Implemented: a partial unique index allows only one active run per task while preserving terminal run history; duplicate-key conflicts re-read and reuse the winning active run; each persisted run gets a distinct Temporal workflow/checkpoint ID; run status updates do not overwrite a status already set by a fast-starting activity.
- Tests: `src/tests/agent-run-concurrency.test.ts` runs simultaneous service calls against a mock implementing the unique-index conflict. This is not a live PostgreSQL concurrency test.
- Limitations: migration application and existing-data compatibility were not verified against Supabase. Applying the index will fail if pre-existing duplicate active runs need operational cleanup.
- Status: IMPLEMENTED; AUTOMATED-TESTED / MOCK-VERIFIED; LIVE-VERIFIED: BLOCKED pending migration and database test.

## C. Approval authorization, correlation, and atomic decisions

- Original problem: approval updates were not compare-and-set operations, and a workspace member could decide an approval without role/task-state authorization.
- Root cause: decision code relied on a prior read and checked only workspace equality.
- Files changed: `src/domain/approvals/approval-service.ts`, `src/adapters/temporal/agent-workflow.ts`
- Implemented: only workspace OWNER/ADMIN members may decide; the referenced task must still belong to that workspace and be `AWAITING_APPROVAL`; updates require `decision = PENDING` and an unexpired row, so duplicate/stale/expired writes cannot win; Temporal signal delivery looks up the task's active run and uses its workflow ID; early signals are buffered only until the activity reveals the exact pending ID, and the first valid decision wins.
- Tests: `src/tests/approval-signal.test.ts` exercises unauthorized roles, wrong task state, stale/expired approvals, malformed decisions, and concurrent decisions; `src/tests/agent-workflow.test.ts` exercises approval correlation and wait behavior.
- Limitations: Supabase compare-and-set behavior and Temporal signal delivery were mock/unit tested, not live verified.
- Status: IMPLEMENTED; AUTOMATED-TESTED / MOCK-VERIFIED; LIVE-VERIFIED: BLOCKED.

## D. Approval and user-input waits

- Original problem: `|| !paused` made approval/input waits immediately satisfiable when the workflow was not paused.
- Root cause: pause state was incorrectly included in the decision/input predicates.
- Files changed: `src/adapters/temporal/agent-workflow.ts`, `src/tests/agent-workflow.test.ts`
- Implemented: approval waits resolve only for a valid matching decision, cancellation, or timeout; input waits resolve only for non-empty input, cancellation, or timeout; pause is a separate wait gate and cannot release either condition.
- Tests: pause and mismatched approval do not release approval wait; pause does not release input wait; resume continues with retained input; a mismatched early approval is not accepted.
- Limitations: Temporal SDK workflow behavior was simulated using unit-test signal/condition handlers; no Temporal test server was run.
- Status: IMPLEMENTED; AUTOMATED-TESTED / MOCK-VERIFIED; LIVE-VERIFIED: BLOCKED.

## E. Pause and resume during execution

- Original problem: pause was only a status/signal and did not stop an in-flight activity at execution checkpoints.
- Root cause: one activity wrapped the whole LangGraph invocation and did not consult persisted run control state.
- Files changed: `src/adapters/langgraph/agent-runtime.ts`, `src/adapters/temporal/agent-activities.ts`, `src/domain/agents/agent-run-service.ts`, `src/adapters/orchestration/temporal-orchestrator.ts`
- Implemented: pause state is persisted before signaling; LangGraph nodes and sandbox side-effect boundaries poll run/task state and block while paused; resume retains input, clears the persisted pause state, and continues the same run-specific checkpoint thread. Temporal activity/workflow timeouts now accommodate the configured 24/72-hour waits.
- Tests: `src/tests/agent-activity-control.test.ts` verifies a paused checkpoint blocks until resumed; `src/tests/agent-workflow.test.ts` verifies workflow wait/resume behavior.
- Limitations: no live worker test; an activity can finish its currently executing operation before the next safe checkpoint. External action idempotency across worker crashes remains dependent on the action/tool implementation and is not live verified.
- Status: IMPLEMENTED; AUTOMATED-TESTED / MOCK-VERIFIED; LIVE-VERIFIED: BLOCKED.

## F. Cancellation

- Original problem: task/run cancellation could be ignored during activity execution or while waiting for approval/input, and task cancellation did not signal active runs.
- Root cause: cancellation was not checked at execution checkpoints, and task-level cancellation only changed task state.
- Files changed: `src/domain/tasks/task-service.ts`, `src/domain/agents/agent-run-service.ts`, `src/adapters/temporal/agent-activities.ts`, `src/adapters/temporal/agent-workflow.ts`, `src/adapters/orchestration/temporal-orchestrator.ts`
- Implemented: task cancellation marks active runs cancelled and signals Temporal; activity checkpoints check both run and task cancellation; the workflow checks cancellation after activity completion and before resumption; cancellation is not treated as an ordinary retryable activity failure.
- Tests: activity-control tests verify run and task cancellation halt a checkpoint; workflow regression verifies cancellation during execution prevents approval resumption.
- Authorization: task cancellation requires workspace membership and restricts cancellation of another user's task to OWNER/ADMIN members.
- Limitations: no live cancellation/worker-shutdown race test.
- Status: IMPLEMENTED; AUTOMATED-TESTED / MOCK-VERIFIED; LIVE-VERIFIED: BLOCKED.

## G. Task ownership and workspace validation

- Original problem: run/approval paths could trust caller-provided task/workspace IDs without checking persisted ownership and membership.
- Root cause: service-role database paths bypassed row-level policies and did not consistently re-check ownership.
- Files changed: `src/api/routes/agent-run-routes.ts`, `src/domain/agents/agent-run-service.ts`, `src/domain/approvals/approval-service.ts`
- Implemented: authenticated identity is used for run creation; run and approval decisions verify task/workspace ownership; approval decisions also require authorized workspace membership and the pending task state.
- Tests: existing business-growth ownership regressions and approval authorization tests.
- Limitations: broader authorization of unrelated API routes was not included in this corrective batch.
- Status: IMPLEMENTED; AUTOMATED-TESTED; LIVE-VERIFIED: BLOCKED.

## H. Task state transitions

- Original problem: repeated requests could force invalid task lifecycle transitions.
- Root cause: lifecycle transitions must respect the persisted current state and state-machine rules.
- Files changed in this correction: `src/domain/tasks/task-service.ts`; prior transition protections remain in `src/services/business-growth/index.ts`.
- Implemented: cancellation validates the current task transition and actor authorization, requests cancellation of active runs, then transitions the task; repeated cancellation returns the already-cancelled task.
- Tests: existing task state-machine tests; cancellation checkpoint tests verify cancelled tasks stop execution.
- Limitations: no live persisted concurrent-transition test.
- Status: IMPLEMENTED; AUTOMATED-TESTED; LIVE-VERIFIED: BLOCKED.

## I. Approval wait failure handling

- Original problem: approval waits could be confused with ordinary execution failures or allow non-approval decisions to continue.
- Root cause: approval state and decision handling were not explicit and correlated.
- Files changed: `src/adapters/temporal/agent-workflow.ts`, `src/domain/approvals/approval-service.ts`, `src/adapters/temporal/agent-activities.ts`
- Implemented: approval/input states remain distinct; rejection, changes requested, expiration, malformed signals, and stale decisions never authorize resumption; activity status is persisted for lifecycle tracking.
- Tests: approval service and Temporal workflow regression tests.
- Limitations: production Temporal/database behavior remains unverified.
- Status: IMPLEMENTED; AUTOMATED-TESTED / MOCK-VERIFIED; LIVE-VERIFIED: BLOCKED.

## J. Regression coverage and verification

- Files changed: `src/tests/agent-activity-control.test.ts`, `src/tests/agent-run-concurrency.test.ts`, `src/tests/agent-workflow.test.ts`, `src/tests/approval-signal.test.ts`, with existing tests retained.
- Automated coverage includes: concurrent active-run creation, unauthorized/stale/expired/duplicate approvals, approval/input waits, pause/resume, cancellation, and existing ownership/state regressions.
- Verification commands and actual results after the final code changes:
  - `npm test` — PASSED (52 tests).
  - `npm run typecheck` — PASSED.
  - `npm run lint` — PASSED.
  - `npm run build` — PASSED.
- These are repository-local automated checks; Temporal and database behavior is MOCK-VERIFIED, not LIVE-VERIFIED.
- Live integration: BLOCKED; tests use mocks and no live Supabase/PostgreSQL or Temporal worker was available.

## Files changed in this corrective review

- `src/adapters/langgraph/agent-runtime.ts`
- `src/adapters/orchestration/temporal-orchestrator.ts`
- `src/adapters/temporal/agent-activities.ts`
- `src/adapters/temporal/agent-workflow.ts`
- `src/api/routes/agent-run-routes.ts`
- `src/domain/agents/agent-run-service.ts`
- `src/domain/agents/orchestrator.ts`
- `src/domain/approvals/approval-service.ts`
- `src/domain/tasks/task-service.ts`
- `src/tests/agent-activity-control.test.ts`
- `src/tests/agent-run-concurrency.test.ts`
- `src/tests/agent-workflow.test.ts`
- `src/tests/approval-signal.test.ts`
- `supabase/migrations/20261116090000_008_agent_run_active_uniqueness.sql`
- `docs/engineering/IMPLEMENTATION_STATUS.md`

## Later phases

- Kaliza Core gateway, Daytona expansion, new LangGraph capabilities, WhatsApp integration expansion, and Business Growth expansion: NOT STARTED.
- No merge to `main`.
