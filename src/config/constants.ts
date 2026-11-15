export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;

export const TaskStatus = {
  RECEIVED: 'RECEIVED',
  CLASSIFIED: 'CLASSIFIED',
  PLANNED: 'PLANNED',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  QUEUED: 'QUEUED',
  EXECUTING: 'EXECUTING',
  AWAITING_INPUT: 'AWAITING_INPUT',
  VERIFYING: 'VERIFYING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;

export type TaskStatusValue = (typeof TaskStatus)[keyof typeof TaskStatus];

export const VALID_TASK_TRANSITIONS: Record<TaskStatusValue, TaskStatusValue[]> = {
  RECEIVED: ['CLASSIFIED', 'CANCELLED', 'FAILED'],
  CLASSIFIED: ['PLANNED', 'AWAITING_INPUT', 'CANCELLED', 'FAILED'],
  PLANNED: ['AWAITING_APPROVAL', 'QUEUED', 'AWAITING_INPUT', 'CANCELLED', 'FAILED'],
  AWAITING_APPROVAL: ['QUEUED', 'CANCELLED', 'EXPIRED', 'FAILED'],
  QUEUED: ['EXECUTING', 'CANCELLED', 'FAILED'],
  EXECUTING: ['AWAITING_INPUT', 'AWAITING_APPROVAL', 'VERIFYING', 'FAILED', 'CANCELLED'],
  AWAITING_INPUT: ['QUEUED', 'EXECUTING', 'CANCELLED', 'EXPIRED', 'FAILED'],
  VERIFYING: ['COMPLETED', 'FAILED', 'AWAITING_INPUT'],
  COMPLETED: [],
  FAILED: ['QUEUED'],
  CANCELLED: [],
  EXPIRED: ['QUEUED', 'CANCELLED'],
};

export const SandboxStatus = {
  REQUESTED: 'REQUESTED',
  PROVISIONING: 'PROVISIONING',
  INITIALIZING: 'INITIALIZING',
  READY: 'READY',
  ACTIVE: 'ACTIVE',
  IDLE: 'IDLE',
  PAUSED: 'PAUSED',
  RESUMING: 'RESUMING',
  FAILED: 'FAILED',
  SUSPENDED: 'SUSPENDED',
  TERMINATING: 'TERMINATING',
  PURGED: 'PURGED',
} as const;

export type SandboxStatusValue = (typeof SandboxStatus)[keyof typeof SandboxStatus];

export const RiskClass = {
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
} as const;

export type RiskClassValue = (typeof RiskClass)[keyof typeof RiskClass];

export const PolicyDecision = {
  ALLOW: 'ALLOW',
  DENY: 'DENY',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
} as const;

export type PolicyDecisionValue = (typeof PolicyDecision)[keyof typeof PolicyDecision];

export const ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
} as const;

export type ApprovalStatusValue = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const IntegrationProvider = {
  WHATSAPP_CONTROL: 'whatsapp_control',
  WHATSAPP_BUSINESS: 'whatsapp_business',
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
  META_ADS: 'meta_ads',
  GOOGLE_DRIVE: 'google_drive',
  GOOGLE_DOCS: 'google_docs',
  GOOGLE_SHEETS: 'google_sheets',
  GOOGLE_CALENDAR: 'google_calendar',
  GOOGLE_GMAIL: 'google_gmail',
  GOOGLE_BUSINESS_PROFILE: 'google_business_profile',
} as const;

export const ServiceId = {
  BUSINESS_GROWTH: 'business-growth',
  CAREER_GROWTH: 'career-growth',
} as const;

export const MessageDirection = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
} as const;

export const ConversationChannel = {
  WHATSAPP: 'WHATSAPP',
  WEB: 'WEB',
} as const;

export const WorkspaceType = {
  INDIVIDUAL: 'INDIVIDUAL',
  BUSINESS: 'BUSINESS',
} as const;

export const MembershipRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;

export const AgentRunStatus = {
  CREATED: 'CREATED',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  AWAITING_INPUT: 'AWAITING_INPUT',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type AgentRunStatusValue = (typeof AgentRunStatus)[keyof typeof AgentRunStatus];
