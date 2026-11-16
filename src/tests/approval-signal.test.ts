import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPendingApproval = {
  id: 'approval-1',
  task_id: 'task-1',
  workspace_id: 'ws-1',
  action_hash: 'hash-1',
  action_version: 1,
  risk: 'MODERATE',
  payload: { action: 'publish' },
  decision: 'PENDING',
  expiry: new Date(Date.now() + 72000000).toISOString(),
};

vi.mock('../adapters/database/supabase.js', () => ({
  getSupabaseAdminClient: () => {
    const queryChain = (data: any) => ({
      select: vi.fn(() => queryChain(data)),
      eq: vi.fn(() => queryChain(data)),
      order: vi.fn(() => queryChain(data)),
      limit: vi.fn(() => queryChain(data)),
      lt: vi.fn(() => queryChain(data)),
      in: vi.fn(() => queryChain(data)),
      insert: vi.fn(() => queryChain(data)),
      update: vi.fn(() => queryChain(data)),
      maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
      single: vi.fn().mockResolvedValue({ data, error: null }),
    });

    let callCount = 0;
    return {
      from: vi.fn(() => {
        callCount++;
        if (callCount === 1) return queryChain(mockPendingApproval);
        return queryChain({ ...mockPendingApproval, decision: 'APPROVED', approver_id: 'user-1' });
      }),
    };
  },
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
  evaluatePolicy: vi.fn(() => ({ approval_required: true, risk_class: 'MODERATE', decision: 'APPROVAL_REQUIRED' })),
}));

vi.mock('../domain/audit/audit-service.js', () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { createApproval, decideApproval } from '../domain/approvals/approval-service.js';
import { ApprovalStatus } from '../config/constants.js';

describe('Approval Service with Temporal Signal Bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create an approval record', async () => {
    const approval = await createApproval({
      task_id: 'task-1',
      workspace_id: 'ws-1',
      risk: 'MODERATE',
      payload: { action: 'publish' },
    });

    expect(approval).toBeDefined();
    expect(approval.decision).toBe(ApprovalStatus.PENDING);
  });

  it('should handle approve decision without error', async () => {
    const approval = await decideApproval({
      approval_id: 'approval-1',
      decision: ApprovalStatus.APPROVED,
      approver_id: 'user-1',
      workspace_id: 'ws-1',
    });

    expect(approval).toBeDefined();
  });

  it('should handle reject decision without error', async () => {
    const approval = await decideApproval({
      approval_id: 'approval-1',
      decision: ApprovalStatus.REJECTED,
      approver_id: 'user-1',
      workspace_id: 'ws-1',
    });

    expect(approval).toBeDefined();
  });
});
