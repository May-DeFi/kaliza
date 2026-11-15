export declare const API_VERSION = "v1";
export declare const API_PREFIX = "/api/v1";
export declare const TaskStatus: {
    readonly RECEIVED: "RECEIVED";
    readonly CLASSIFIED: "CLASSIFIED";
    readonly PLANNED: "PLANNED";
    readonly AWAITING_APPROVAL: "AWAITING_APPROVAL";
    readonly QUEUED: "QUEUED";
    readonly EXECUTING: "EXECUTING";
    readonly AWAITING_INPUT: "AWAITING_INPUT";
    readonly VERIFYING: "VERIFYING";
    readonly COMPLETED: "COMPLETED";
    readonly FAILED: "FAILED";
    readonly CANCELLED: "CANCELLED";
    readonly EXPIRED: "EXPIRED";
};
export type TaskStatusValue = (typeof TaskStatus)[keyof typeof TaskStatus];
export declare const VALID_TASK_TRANSITIONS: Record<TaskStatusValue, TaskStatusValue[]>;
export declare const SandboxStatus: {
    readonly REQUESTED: "REQUESTED";
    readonly PROVISIONING: "PROVISIONING";
    readonly INITIALIZING: "INITIALIZING";
    readonly READY: "READY";
    readonly ACTIVE: "ACTIVE";
    readonly IDLE: "IDLE";
    readonly PAUSED: "PAUSED";
    readonly RESUMING: "RESUMING";
    readonly FAILED: "FAILED";
    readonly SUSPENDED: "SUSPENDED";
    readonly TERMINATING: "TERMINATING";
    readonly PURGED: "PURGED";
};
export type SandboxStatusValue = (typeof SandboxStatus)[keyof typeof SandboxStatus];
export declare const RiskClass: {
    readonly LOW: "LOW";
    readonly MODERATE: "MODERATE";
    readonly HIGH: "HIGH";
};
export type RiskClassValue = (typeof RiskClass)[keyof typeof RiskClass];
export declare const PolicyDecision: {
    readonly ALLOW: "ALLOW";
    readonly DENY: "DENY";
    readonly APPROVAL_REQUIRED: "APPROVAL_REQUIRED";
};
export type PolicyDecisionValue = (typeof PolicyDecision)[keyof typeof PolicyDecision];
export declare const ApprovalStatus: {
    readonly PENDING: "PENDING";
    readonly APPROVED: "APPROVED";
    readonly REJECTED: "REJECTED";
    readonly CHANGES_REQUESTED: "CHANGES_REQUESTED";
    readonly EXPIRED: "EXPIRED";
    readonly REVOKED: "REVOKED";
};
export type ApprovalStatusValue = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];
export declare const IntegrationProvider: {
    readonly WHATSAPP_CONTROL: "whatsapp_control";
    readonly WHATSAPP_BUSINESS: "whatsapp_business";
    readonly FACEBOOK: "facebook";
    readonly INSTAGRAM: "instagram";
    readonly META_ADS: "meta_ads";
    readonly GOOGLE_DRIVE: "google_drive";
    readonly GOOGLE_DOCS: "google_docs";
    readonly GOOGLE_SHEETS: "google_sheets";
    readonly GOOGLE_CALENDAR: "google_calendar";
    readonly GOOGLE_GMAIL: "google_gmail";
    readonly GOOGLE_BUSINESS_PROFILE: "google_business_profile";
};
export declare const ServiceId: {
    readonly BUSINESS_GROWTH: "business-growth";
    readonly CAREER_GROWTH: "career-growth";
};
export declare const MessageDirection: {
    readonly INBOUND: "INBOUND";
    readonly OUTBOUND: "OUTBOUND";
};
export declare const ConversationChannel: {
    readonly WHATSAPP: "WHATSAPP";
    readonly WEB: "WEB";
};
export declare const WorkspaceType: {
    readonly INDIVIDUAL: "INDIVIDUAL";
    readonly BUSINESS: "BUSINESS";
};
export declare const MembershipRole: {
    readonly OWNER: "OWNER";
    readonly ADMIN: "ADMIN";
    readonly MEMBER: "MEMBER";
};
export declare const AgentRunStatus: {
    readonly CREATED: "CREATED";
    readonly RUNNING: "RUNNING";
    readonly PAUSED: "PAUSED";
    readonly AWAITING_APPROVAL: "AWAITING_APPROVAL";
    readonly AWAITING_INPUT: "AWAITING_INPUT";
    readonly COMPLETED: "COMPLETED";
    readonly FAILED: "FAILED";
    readonly CANCELLED: "CANCELLED";
};
export type AgentRunStatusValue = (typeof AgentRunStatus)[keyof typeof AgentRunStatus];
//# sourceMappingURL=constants.d.ts.map