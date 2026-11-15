import type { AuditEvent } from '../../contracts/types.js';
export declare function recordAuditEvent(input: {
    workspace_id?: string;
    actor: string;
    action: string;
    target?: string;
    target_id?: string;
    correlation_id?: string;
    outcome?: string;
    metadata?: Record<string, unknown>;
}): Promise<AuditEvent>;
export declare function listWorkspaceAuditEvents(workspaceId: string, limit?: number, offset?: number): Promise<{
    events: AuditEvent[];
    total: number;
}>;
//# sourceMappingURL=audit-service.d.ts.map