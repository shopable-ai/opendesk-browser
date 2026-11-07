// Shared, unprivileged product contract; Host applies its own fixed allowlist.
export const QUEUE_PROTOCOL='opendesk.ai-send-queue.control.v1';
export const QUEUE_COMMANDS=Object.freeze(['pause','resume','now','edit','remove','move']);
export const QUEUE_READ='sendQueue.snapshot';
export const QUEUE_WRITE='sendQueue.command';
export const QUEUE_MEMORY_ONLY=true;
