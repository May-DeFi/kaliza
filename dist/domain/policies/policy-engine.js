import { RiskClass, PolicyDecision } from '../../config/constants.js';
import { hashString } from '../../adapters/encryption/crypto.js';
const HIGH_RISK_ACTIONS = new Set([
    'publish_external',
    'send_outbound_message',
    'activate_ad_campaign',
    'change_ad_budget',
    'delete_asset',
    'make_purchase',
    'account_security_change',
    'legal_commitment',
    'financial_commitment',
    'submit_job_application',
]);
const MODERATE_RISK_ACTIONS = new Set([
    'edit_draft',
    'update_internal_record',
    'reversible_change',
    'schedule_content',
]);
const LOW_RISK_ACTIONS = new Set([
    'read_research',
    'generate_draft',
    'analyze_data',
    'read_only_retrieval',
    'classify_intent',
    'create_plan',
]);
export function classifyRisk(action) {
    if (HIGH_RISK_ACTIONS.has(action))
        return RiskClass.HIGH;
    if (MODERATE_RISK_ACTIONS.has(action))
        return RiskClass.MODERATE;
    if (LOW_RISK_ACTIONS.has(action))
        return RiskClass.LOW;
    return RiskClass.MODERATE;
}
const POLICY_VERSION = '1.0.0';
export function evaluatePolicy(input) {
    const risk = input.risk_override ?? classifyRisk(input.action);
    if (risk === RiskClass.LOW) {
        return {
            decision: PolicyDecision.ALLOW,
            reason: `Low-risk action: ${input.action}`,
            policy_version: POLICY_VERSION,
            risk_class: risk,
            approval_required: false,
        };
    }
    if (risk === RiskClass.MODERATE) {
        if (input.role === 'OWNER' || input.role === 'ADMIN') {
            return {
                decision: PolicyDecision.ALLOW,
                reason: `Moderate-risk action permitted for ${input.role}`,
                policy_version: POLICY_VERSION,
                risk_class: risk,
                approval_required: false,
            };
        }
        return {
            decision: PolicyDecision.APPROVAL_REQUIRED,
            reason: `Moderate-risk action requires approval for role ${input.role}`,
            policy_version: POLICY_VERSION,
            risk_class: risk,
            approval_required: true,
        };
    }
    return {
        decision: PolicyDecision.APPROVAL_REQUIRED,
        reason: `High-risk action requires explicit approval: ${input.action}`,
        policy_version: POLICY_VERSION,
        risk_class: risk,
        approval_required: true,
    };
}
export function computeActionHash(payload) {
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    return hashString(canonical);
}
export function hasPayloadChanged(currentHash, payload) {
    return computeActionHash(payload) !== currentHash;
}
//# sourceMappingURL=policy-engine.js.map