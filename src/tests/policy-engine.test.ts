import { describe, it, expect } from 'vitest';
import { evaluatePolicy, classifyRisk, computeActionHash } from '../domain/policies/policy-engine.js';
import { RiskClass, PolicyDecision } from '../config/constants.js';

describe('Policy Engine', () => {
  describe('classifyRisk', () => {
    it('classifies high-risk actions', () => {
      expect(classifyRisk('publish_external')).toBe(RiskClass.HIGH);
      expect(classifyRisk('send_outbound_message')).toBe(RiskClass.HIGH);
      expect(classifyRisk('activate_ad_campaign')).toBe(RiskClass.HIGH);
      expect(classifyRisk('delete_asset')).toBe(RiskClass.HIGH);
    });

    it('classifies moderate-risk actions', () => {
      expect(classifyRisk('edit_draft')).toBe(RiskClass.MODERATE);
      expect(classifyRisk('update_internal_record')).toBe(RiskClass.MODERATE);
    });

    it('classifies low-risk actions', () => {
      expect(classifyRisk('read_research')).toBe(RiskClass.LOW);
      expect(classifyRisk('generate_draft')).toBe(RiskClass.LOW);
      expect(classifyRisk('create_plan')).toBe(RiskClass.LOW);
    });

    it('defaults unknown actions to moderate', () => {
      expect(classifyRisk('unknown_action')).toBe(RiskClass.MODERATE);
    });
  });

  describe('evaluatePolicy', () => {
    it('allows low-risk actions without approval', () => {
      const result = evaluatePolicy({
        workspace_id: 'ws-1',
        user_id: 'user-1',
        role: 'MEMBER',
        action: 'read_research',
      });
      expect(result.decision).toBe(PolicyDecision.ALLOW);
      expect(result.approval_required).toBe(false);
      expect(result.risk_class).toBe(RiskClass.LOW);
    });

    it('allows moderate-risk for OWNER/ADMIN without approval', () => {
      const result = evaluatePolicy({
        workspace_id: 'ws-1',
        user_id: 'user-1',
        role: 'OWNER',
        action: 'edit_draft',
      });
      expect(result.decision).toBe(PolicyDecision.ALLOW);
      expect(result.approval_required).toBe(false);
    });

    it('requires approval for moderate-risk MEMBER actions', () => {
      const result = evaluatePolicy({
        workspace_id: 'ws-1',
        user_id: 'user-1',
        role: 'MEMBER',
        action: 'edit_draft',
      });
      expect(result.decision).toBe(PolicyDecision.APPROVAL_REQUIRED);
      expect(result.approval_required).toBe(true);
    });

    it('always requires approval for high-risk actions', () => {
      const result = evaluatePolicy({
        workspace_id: 'ws-1',
        user_id: 'user-1',
        role: 'OWNER',
        action: 'publish_external',
      });
      expect(result.decision).toBe(PolicyDecision.APPROVAL_REQUIRED);
      expect(result.approval_required).toBe(true);
      expect(result.risk_class).toBe(RiskClass.HIGH);
    });
  });

  describe('computeActionHash', () => {
    it('produces consistent hashes for same payload', () => {
      const payload = { action: 'publish', target: 'page-1', content: 'hello' };
      expect(computeActionHash(payload)).toBe(computeActionHash(payload));
    });

    it('produces different hashes for different payloads', () => {
      expect(computeActionHash({ a: 1 })).not.toBe(computeActionHash({ a: 2 }));
    });
  });
});
