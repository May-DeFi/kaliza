# Kaliza Backend

AI-powered opportunity discovery and execution platform. Built from the Master System Architecture and Backend Developer Specification.

## What this is

A modular monolith backend that turns WhatsApp and web requests into durable, policy-governed agent workflows. The backend owns all authoritative state — tasks, approvals, billing, integrations, sandbox lifecycle, audit trail.

## Architecture (7 phases)

| Phase | What was built |
|---|---|
| 1 | Project foundation, identity/tenancy, workspaces, service registry, user/workspace API |
| 2 | Conversations, messages, task state machine, durable job queue, audit log, webhooks, file metadata |
| 3 | Policy engine (risk classification + approval gates), approval service, tool registry/gateway, model gateway (OpenAI/Anthropic), agent orchestrator abstraction |
| 4 | Daytona sandbox adapter, sandbox manager (provision/pause/resume/terminate), usage metering, recovery worker |
| 5 | Google + Meta connector adapters with OAuth flows, integration connections, provider asset discovery |
| 6 | Business Growth service (6 workflow definitions), notification service, Career Growth scaffold |
| 7 | Admin API (health, metrics, audit trail, stuck tasks, failed jobs), billing/plans, notification worker |

## Running

```bash
npm install
npm run build
npm start          # API server on port 3000
npm run dev        # Hot-reload dev mode
npm test           # Run test suite
npm run typecheck  # Type-check without emitting
```

Workers (run separately):
```bash
npx tsx src/workers/job-worker.ts           # WhatsApp message processing
npx tsx src/workers/recovery-worker.ts      # Stuck task + sandbox reconciliation
npx tsx src/workers/notification-worker.ts  # Notification delivery
```

## API surface (all under /api/v1)

- `GET/POST /workspaces` — workspace management
- `GET/POST /users` — user profile
- `GET /services` — service registry
- `GET/POST /conversations` — conversations and messages
- `GET/POST /tasks` — tasks, steps, transitions, cancel/resume
- `GET/POST /approvals` — approval requests and decisions
- `GET /tools` — tool registry
- `POST /agent-runs` — orchestrator run lifecycle
- `POST /sandboxes` — Daytona sandbox provisioning and execution
- `GET /usage` — usage summaries and quota checks
- `GET/POST /integrations` — OAuth connections and asset discovery
- `GET /notifications` — notification list
- `POST /business-growth/tasks` — start Business Growth workflows
- `GET /admin/*` — admin health, metrics, audit trail
- `GET/POST /billing/*` — subscriptions, plans, entitlements
- `GET/POST /whatsapp/webhook` — WhatsApp webhook receiver

## Database

All schema is in Supabase (PostgreSQL) with row-level security on every table. Migrations are applied via the Supabase MCP tool. 7 migrations cover all phases.

## Placeholder credentials

All third-party API keys (Meta, Google, Daytona, OpenAI, Anthropic) use placeholder values in `.env.example`. The system runs in stub mode when placeholders are detected — it returns simulated responses instead of making real API calls. Replace placeholders with real keys to enable live integration.

## Key design decisions

- **Task state is authoritative in the database**, not in agent process memory
- **Policy is enforced deterministically** — the LLM never decides its own permissions
- **Approvals bind to exact action payload hashes** — payload changes invalidate prior approvals
- **Sandbox lifecycle is reconciled** by a recovery worker (idle pause, expiry termination)
- **Row-level security** on every table with workspace membership checks
- **Webhook deduplication** by provider event ID prevents duplicate side effects
