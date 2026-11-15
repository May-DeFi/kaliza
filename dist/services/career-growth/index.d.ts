export declare const SERVICE_ID: "career-growth";
export declare const CAPABILITIES: {
    readonly PROFILE_PREPARATION: "profile_preparation";
    readonly JOB_DISCOVERY: "job_discovery";
    readonly ROLE_MATCHING: "role_matching";
    readonly APPLICATION_PREPARATION: "application_preparation";
    readonly APPLICATION_TRACKING: "application_tracking";
    readonly INTERVIEW_PREP: "interview_prep";
};
export declare const WORKFLOW_DEFINITIONS: ({
    definition_id: string;
    version: number;
    name: string;
    capability: "profile_preparation";
    steps: string[];
    approval_points: string[];
} | {
    definition_id: string;
    version: number;
    name: string;
    capability: "job_discovery";
    steps: string[];
    approval_points: never[];
} | {
    definition_id: string;
    version: number;
    name: string;
    capability: "application_preparation";
    steps: string[];
    approval_points: string[];
})[];
export declare const AVAILABILITY: {
    readonly available: false;
    readonly status: "PLANNED";
    readonly note: "Career Growth is a future service. This contract is scaffolded for planning purposes only.";
};
//# sourceMappingURL=index.d.ts.map