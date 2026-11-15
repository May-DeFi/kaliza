export interface NotificationInput {
    workspace_id: string;
    user_id?: string;
    type: string;
    channel?: string;
    title?: string;
    content: string;
    task_id?: string;
    metadata?: Record<string, unknown>;
}
export declare function createNotification(input: NotificationInput): Promise<void>;
export declare function getPendingNotifications(limit?: number): Promise<Record<string, unknown>[]>;
export declare function deliverNotification(notification: Record<string, unknown>): Promise<void>;
export declare function notifyTaskEvent(input: {
    workspace_id: string;
    user_id?: string;
    task_id: string;
    event: string;
    message: string;
}): Promise<void>;
export declare function listWorkspaceNotifications(workspaceId: string, limit?: number): Promise<Record<string, unknown>[]>;
//# sourceMappingURL=notification-service.d.ts.map