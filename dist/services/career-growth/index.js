import { ServiceId } from '../../config/constants.js';
export const SERVICE_ID = ServiceId.CAREER_GROWTH;
export const CAPABILITIES = {
    PROFILE_PREPARATION: 'profile_preparation',
    JOB_DISCOVERY: 'job_discovery',
    ROLE_MATCHING: 'role_matching',
    APPLICATION_PREPARATION: 'application_preparation',
    APPLICATION_TRACKING: 'application_tracking',
    INTERVIEW_PREP: 'interview_prep',
};
export const WORKFLOW_DEFINITIONS = [
    {
        definition_id: 'cg-profile-prep',
        version: 1,
        name: 'Profile & CV Preparation',
        capability: CAPABILITIES.PROFILE_PREPARATION,
        steps: ['gather_profile', 'draft_cv', 'await_review', 'finalize'],
        approval_points: ['finalize'],
    },
    {
        definition_id: 'cg-job-discovery',
        version: 1,
        name: 'Job Discovery & Role Matching',
        capability: CAPABILITIES.JOB_DISCOVERY,
        steps: ['define_criteria', 'search_jobs', 'match_roles', 'present_results'],
        approval_points: [],
    },
    {
        definition_id: 'cg-application',
        version: 1,
        name: 'Application Preparation & Submission',
        capability: CAPABILITIES.APPLICATION_PREPARATION,
        steps: ['tailor_cv', 'write_cover_letter', 'await_approval', 'submit_application', 'track'],
        approval_points: ['submit_application'],
    },
];
export const AVAILABILITY = {
    available: false,
    status: 'PLANNED',
    note: 'Career Growth is a future service. This contract is scaffolded for planning purposes only.',
};
//# sourceMappingURL=index.js.map