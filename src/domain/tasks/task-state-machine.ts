import { VALID_TASK_TRANSITIONS, type TaskStatusValue } from '../../config/constants.js';
import { ConflictError } from '../../api/middleware/errors.js';

export function canTransition(from: TaskStatusValue, to: TaskStatusValue): boolean {
  const allowed = VALID_TASK_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}

export function assertCanTransition(from: TaskStatusValue, to: TaskStatusValue): void {
  if (!canTransition(from, to)) {
    throw new ConflictError(`Invalid task state transition: ${from} -> ${to}`);
  }
}

export function isTerminalStatus(status: TaskStatusValue): boolean {
  const terminal: TaskStatusValue[] = ['COMPLETED', 'CANCELLED', 'EXPIRED'];
  return terminal.includes(status);
}

export function isResumableStatus(status: TaskStatusValue): boolean {
  const resumable: TaskStatusValue[] = ['FAILED', 'EXPIRED', 'AWAITING_INPUT'];
  return resumable.includes(status);
}
