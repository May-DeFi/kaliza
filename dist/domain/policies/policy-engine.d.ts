import type { RiskClassValue, PolicyEvaluation } from '../../contracts/types.js';
export interface PolicyInput {
    workspace_id: string;
    user_id: string;
    role: string;
    service_id?: string;
    tool_id?: string;
    action: string;
    target_resource?: string;
    requested_scopes?: string[];
    risk_override?: RiskClassValue;
}
export declare function classifyRisk(action: string): RiskClassValue;
export declare function evaluatePolicy(input: PolicyInput): PolicyEvaluation;
export declare function computeActionHash(payload: Record<string, unknown>): string;
export declare function hasPayloadChanged(currentHash: string, payload: Record<string, unknown>): boolean;
//# sourceMappingURL=policy-engine.d.ts.map