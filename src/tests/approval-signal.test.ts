import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  approval: {
    id: 'approval-1',
    task_id: 'task-1',
    workspace_id: 'ws-1',
    action_hash: 'hash-1',
    action_version: 1,
    risk: 'MODERATE',
    payload: { action: 'publish' },
    decision: 'PENDING',
    approver_id: null as string | null,
    expiry: new Date(Date.now() + 72000000).toISOString(),
  },
  membership: { role: 'OWNER' as string } as { role: string } | null,
  task: { id: 'task-1', workspace_id: 'ws-1', status: 'AWAITING_APPROVAL' },
}));

vi.mock('../adapters/database/supabase.js', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      let filters: Record<string, unknown> = {};
      let updateValues: Record<string, unknown> | null = null;
      let isInsert = false;
      const builder: any = {
        select: () => builder,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return builder;
        },
        gt: (key: string, value: unknown) => {
          filters[`${key}_gt`] = value;
          return builder;
        },
        lt: (key: string, value: unknown) => {
          filters[`${key}_lt`] = value;
          return builder;
        },
        order: () => builder,
        insert: () => {
          isInsert = true;
          return builder;
        },
        update: (values: Record<string, unknown>) => {
          updateValues = values;
          return builder;
        },
        maybeSingle: async () => execute(),
        single: async () => execute(),
      };
      const execute = async () => {
        if (table === 'tasks') return { data: state.task, error: null };
        if (table === 'memberships') return { data: state.membership, error: null };
        if (table !== 'approvals') return { data: null, error: null };
        if (isInsert) return { data: { ...state.approval }, error: null };

        const approval = state.approval;
        if (filters.id && filters.id !== approval.id) return { data: null, error: null };
        if (filters.decision && filters.decision !== approval.decision) return { data: null, error: null };
        if (filters.expiry_gt && new Date(approval.expiry).getTime() <= new Date(String(filters.expiry_gt)).getTime()) {
          return { data: null, error: null };
        }
        if (updateValues) {
          Object.assign(approval, updateValues);
          return { data: { ...approval }, error: null };
        }
        return { data: { ...approval }, error: null };
      };
      return builder;
    },
  }),
}));

vi.mock('../domain/tenancy/workspace-service.js', () => ({
  getMembership: vi.fn(async () => state.membership),
}));

vi.mock('../adapters/temporal/temporal-client.js', () => ({
  isTemporalConfigured: vi.fn(() => false),
  getTemporalClient: vi.fn(),
}));

vi.mock('../config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../domain/policies/policy-engine.js', () => ({
  computeActionHash: vi.fn(() => 'hash-1'),
  hasPayloadChanged: vi.fn(() => false),
}));

vi.mock('../domain/audit/audit-service.js', () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { createApproval, decideApproval } from '../domain/approvals/approval-service.js';
import { ApprovalStatus } from '../config/constants.js';

describe('Approval service authorization and atomic decisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(state.approval, {
      decision: ApprovalStatus.PENDING,
      approver_id: null,
      expiry: new Date(Date.now() + 72000000).toISOString(),
      payload: { action: 'publish' },
    });
    state.membership = { role: 'OWNER' };
    state.task = { id: 'task-1', workspace_id: 'ws-1', status: 'AWAITING_APPROVAL' };
  });

  it('creates a pending approval for a task in the supplied workspace', async () => {
    const approval = await createApproval({
      task_id: 'task-1',
      workspace_id: 'ws-1',
      risk: 'MODERATE',
      payload: { action: 'publish' },
    });

    expect(approval.decision).toBe(ApprovalStatus.PENDING);
  });

  it('rejects malformed approval decisions', async () => {
    await expect(decideApproval({
      approval_id: 'approval-1',
      decision: 'REVOKED' as any,
      approver_id: 'user-1',
      workspace_id: 'ws-1',
    })).rejects.toThrow('Invalid approval decision');
  });

  it('rejects an approver without an authorized workspace role', async () => {
    state.membership = { role: 'MEMBER' };

    await expect(decideApproval({
      approval_id: 'approval-1',
      decision: ApprovalStatus.APPROVED,
      approver_id: 'user-1',
      workspace_id: 'ws-1',
    })).rejects.toThrow('not authorized');
  });

  it('rejects decisions when the task is no longer awaiting approval', async () => {
    state.task.status = 'COMPLETED';

    await expect(decideApproval({
      approval_id: 'approval-1',
      decision: ApprovalStatus.APPROVED,
      approver_id: 'user-1',
      workspace_id: 'ws-1',
    })).rejects.toThrow('no longer awaiting approval');
  });

  it('rejects duplicate or stale approval decisions atomically', async () => {
    state.approval.decision = ApprovalStatus.REJECTED;

    await expect(decideApproval({
      approval_id: 'approval-1',
      decision: ApprovalStatus.APPROVED,
      approver_id: 'user-1',
      workspace_id: 'ws-1',
    })).rejects.toThrow('already been decided');
  });

  it('accepts at most one concurrent decision for a pending approval', async () => {
    const decisions = await Promise.allSettled([
      decideApproval({
        approval_id: 'approval-1',
        decision: ApprovalStatus.APPROVED,
        approver_id: 'user-1',
        workspace_id: 'ws-1',
      }),
      decideApproval({
        approval_id: 'approval-1',
        decision: ApprovalStatus.REJECTED,
        approver_id: 'user-2',
        workspace_id: 'ws-1',
      }),
    ]);

    expect(decisions.filter((decision) => decision.status === 'fulfilled')).toHaveLength(1);
    expect(state.approval.decision).not.toBe(ApprovalStatus.PENDING);
  });

  it('rejects an expired approval without authorizing the action', async () => {
    state.approval.expiry = new Date(Date.now() - 1000).toISOString();

    await expect(decideApproval({
      approval_id: 'approval-1',
      decision: ApprovalStatus.APPROVED,
      approver_id: 'user-1',
      workspace_id: 'ws-1',
    })).rejects.toThrow('expired');

    expect(state.approval.decision).toBe(ApprovalStatus.EXPIRED);
  });
});
