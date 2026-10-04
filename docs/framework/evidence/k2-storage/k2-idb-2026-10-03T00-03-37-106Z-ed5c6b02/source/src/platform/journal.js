import {canonical, invariant} from './protocol.js';

export function commandKey(runId, commandId) {
  invariant(typeof runId === 'string' && runId.length > 0 && typeof commandId === 'string' && commandId.length > 0,
    'E_SCHEMA', 'Command keys require a run and command ID');
  return `command:${canonical([runId, commandId])}`;
}

export function commandRecordKey(command) {
  return commandKey(command.identity?.runId, command.commandId);
}

export function pageCommandKey(kind, runId, commandId) {
  invariant(['submit', 'raw', 'effect'].includes(kind), 'E_SCHEMA', 'Unknown page journal namespace');
  return `page-${kind}:${canonical([runId, commandId])}`;
}
