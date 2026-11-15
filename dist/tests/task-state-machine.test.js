import { describe, it, expect } from 'vitest';
import { canTransition, isTerminalStatus, isResumableStatus } from '../domain/tasks/task-state-machine.js';
import { TaskStatus } from '../config/constants.js';
describe('Task State Machine', () => {
    describe('canTransition', () => {
        it('allows valid transitions', () => {
            expect(canTransition(TaskStatus.RECEIVED, TaskStatus.CLASSIFIED)).toBe(true);
            expect(canTransition(TaskStatus.CLASSIFIED, TaskStatus.PLANNED)).toBe(true);
            expect(canTransition(TaskStatus.PLANNED, TaskStatus.QUEUED)).toBe(true);
            expect(canTransition(TaskStatus.QUEUED, TaskStatus.EXECUTING)).toBe(true);
            expect(canTransition(TaskStatus.EXECUTING, TaskStatus.VERIFYING)).toBe(true);
            expect(canTransition(TaskStatus.VERIFYING, TaskStatus.COMPLETED)).toBe(true);
        });
        it('rejects invalid transitions', () => {
            expect(canTransition(TaskStatus.RECEIVED, TaskStatus.EXECUTING)).toBe(false);
            expect(canTransition(TaskStatus.COMPLETED, TaskStatus.EXECUTING)).toBe(false);
            expect(canTransition(TaskStatus.CANCELLED, TaskStatus.QUEUED)).toBe(false);
        });
        it('allows recovery from FAILED to QUEUED', () => {
            expect(canTransition(TaskStatus.FAILED, TaskStatus.QUEUED)).toBe(true);
        });
        it('allows AWAITING_INPUT to resume', () => {
            expect(canTransition(TaskStatus.AWAITING_INPUT, TaskStatus.QUEUED)).toBe(true);
            expect(canTransition(TaskStatus.AWAITING_INPUT, TaskStatus.EXECUTING)).toBe(true);
        });
    });
    describe('isTerminalStatus', () => {
        it('identifies terminal states', () => {
            expect(isTerminalStatus(TaskStatus.COMPLETED)).toBe(true);
            expect(isTerminalStatus(TaskStatus.CANCELLED)).toBe(true);
            expect(isTerminalStatus(TaskStatus.EXPIRED)).toBe(true);
        });
        it('identifies non-terminal states', () => {
            expect(isTerminalStatus(TaskStatus.EXECUTING)).toBe(false);
            expect(isTerminalStatus(TaskStatus.QUEUED)).toBe(false);
        });
    });
    describe('isResumableStatus', () => {
        it('identifies resumable states', () => {
            expect(isResumableStatus(TaskStatus.FAILED)).toBe(true);
            expect(isResumableStatus(TaskStatus.AWAITING_INPUT)).toBe(true);
        });
        it('identifies non-resumable states', () => {
            expect(isResumableStatus(TaskStatus.COMPLETED)).toBe(false);
            expect(isResumableStatus(TaskStatus.EXECUTING)).toBe(false);
        });
    });
});
//# sourceMappingURL=task-state-machine.test.js.map