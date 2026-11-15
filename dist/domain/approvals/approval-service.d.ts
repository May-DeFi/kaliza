import type { Approval } from '../../contracts/types.js';
import { type RiskClassValue, type ApprovalStatusValue } from '../../config/constants.js';
export declare function createApproval(input: {
    task_id: string;
    workspace_id: string;
    risk: RiskClassValue;
    payload: Record<string, unknown>;
    expiryHours?: number;
}): Promise<Approval>;
export declare function getApproval(id: string): Promise<Approval>;
export declare function listTaskApprovals(taskId: string): Promise<Approval[]>;
export declare function listPendingApprovals(workspaceId: string): Promise<Approval[]>;
export declare function decideApproval(input: {
    approval_id: string;
    decision: ApprovalStatusValue;
    approver_id: string;
    workspace_id: string;
    modified_payload?: Record<string, unknown>;
}): Promise<Approval>;
export declare function isApprovalValid(approval: Approval, payload: Record<string, unknown>): boolean;
export declare function expireStaleApprovals(): Promise<number>;
//# sourceMappingURL=approval-service.d.ts.map