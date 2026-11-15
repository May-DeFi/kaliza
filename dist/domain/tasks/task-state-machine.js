import { VALID_TASK_TRANSITIONS } from '../../config/constants.js';
import { ConflictError } from '../../api/middleware/errors.js';
export function canTransition(from, to) {
    const allowed = VALID_TASK_TRANSITIONS[from] ?? [];
    return allowed.includes(to);
}
export function assertCanTransition(from, to) {
    if (!canTransition(from, to)) {
        throw new ConflictError(`Invalid task state transition: ${from} -> ${to}`);
    }
}
export function isTerminalStatus(status) {
    const terminal = ['COMPLETED', 'CANCELLED', 'EXPIRED'];
    return terminal.includes(status);
}
export function isResumableStatus(status) {
    const resumable = ['FAILED', 'EXPIRED', 'AWAITING_INPUT'];
    return resumable.includes(status);
}
//# sourceMappingURL=task-state-machine.js.map