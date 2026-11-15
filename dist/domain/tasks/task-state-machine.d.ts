import { type TaskStatusValue } from '../../config/constants.js';
export declare function canTransition(from: TaskStatusValue, to: TaskStatusValue): boolean;
export declare function assertCanTransition(from: TaskStatusValue, to: TaskStatusValue): void;
export declare function isTerminalStatus(status: TaskStatusValue): boolean;
export declare function isResumableStatus(status: TaskStatusValue): boolean;
//# sourceMappingURL=task-state-machine.d.ts.map