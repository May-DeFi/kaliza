import { describe, it, expect } from 'vitest';
import { TaskStatus } from '../config/constants.js';
import { canTransition, assertCanTransition, isTerminalStatus } from '../domain/tasks/task-state-machine.js';
import { ConflictError } from '../api/middleware/errors.js';

describe('Task Service — State Machine Integration', () => {
  it('full happy-path lifecycle transitions are valid', () => {
    const path: { from: string; to: string }[] = [
      { from: TaskStatus.RECEIVED, to: TaskStatus.CLASSIFIED },
      { from: TaskStatus.CLASSIFIED, to: TaskStatus.PLANNED },
      { from: TaskStatus.PLANNED, to: TaskStatus.QUEUED },
      { from: TaskStatus.QUEUED, to: TaskStatus.EXECUTING },
      { from: TaskStatus.EXECUTING, to: TaskStatus.VERIFYING },
      { from: TaskStatus.VERIFYING, to: TaskStatus.COMPLETED },
    ];

    for (const step of path) {
      expect(canTransition(step.from as any, step.to as any)).toBe(true);
    }
  });

  it('approval interruption is valid mid-execution', () => {
    expect(canTransition(TaskStatus.EXECUTING, TaskStatus.AWAITING_APPROVAL)).toBe(true);
    expect(canTransition(TaskStatus.AWAITING_APPROVAL, TaskStatus.QUEUED)).toBe(true);
  });

  it('assertCanTransition throws on invalid transition', () => {
    expect(() => assertCanTransition(TaskStatus.COMPLETED, TaskStatus.EXECUTING)).toThrow(ConflictError);
  });

  it('COMPLETED is terminal and cannot transition', () => {
    expect(isTerminalStatus(TaskStatus.COMPLETED)).toBe(true);
    expect(canTransition(TaskStatus.COMPLETED, TaskStatus.QUEUED)).toBe(false);
  });
});
