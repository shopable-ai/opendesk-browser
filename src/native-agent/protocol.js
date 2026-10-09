import {canonical,digest} from '../platform/protocol.js';
// Shared browser-side transport contract. Never contains Node APIs or browser execution shortcuts.
export const AGENT_VERSION = 1;
export const AGENT_HOST = 'com.shopable.opendesk_browser.agent';
export const AGENT_CONFIG_PROTOCOL = 'opendesk.native-agent.config.v1';
export const AGENT_LEDGER_KEY = 'opendesk.native-agent.ledger.v1';
export const AGENT_ENABLED_KEY = 'opendesk.native-agent.enabled.v1';
export const AGENT_MAX_BYTES = 60 * 1024;
export const AGENT_MAX_LEDGER = 256;
export const AGENT_MUTATIONS = Object.freeze(['script.save', 'run.start', 'run.stop', 'page.preview']);
export const AGENT_METHODS = Object.freeze(['bridge.status', 'target.current', 'script.save', 'run.start', 'run.get', 'run.stop', 'page.preview', 'page.get']);

export class AgentBridgeError extends Error {
  constructor(code, message = code, outcome = 'NOT_DISPATCHED') {
    super(message);
    this.code = code;
    this.outcome = outcome;
  }
}
export const agentError = (code, message, outcome) => new AgentBridgeError(code, message, outcome);
export const agentObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
// Share the existing strict JSON canonicalization and SHA-256 with Controller.
export const agentCanonical = canonical;
export const agentDigest = digest;
export function agentValidateRequest(message) {
  if (!agentObject(message) || message.v !== AGENT_VERSION || message.kind !== 'request' ||
    typeof message.requestId !== 'string' || !/^[a-zA-Z0-9._:-]{1,100}$/.test(message.requestId) ||
    !AGENT_METHODS.includes(message.method) || !agentObject(message.params))
    throw agentError('E_SCHEMA');
  if (new TextEncoder().encode(agentCanonical(message)).length > AGENT_MAX_BYTES)
    throw agentError('E_LIMIT');
  return message;
}
export function agentTargetFromSnapshot(snapshot) {
  if (snapshot?.status !== 'available' || !Number.isSafeInteger(snapshot.windowId) ||
    !Number.isSafeInteger(snapshot.tabId) || snapshot.frameId !== 0 ||
    typeof snapshot.documentId !== 'string' || !snapshot.documentId ||
    typeof snapshot.url !== 'string' || typeof snapshot.origin !== 'string') throw agentError('E_DOCUMENT_STALE');
  return {windowId:snapshot.windowId,tabId:snapshot.tabId,frameId:0,documentId:snapshot.documentId,
    url:snapshot.url,origin:snapshot.origin};
}
export function agentSameTarget(a,b) {
  return ['windowId','tabId','frameId','documentId','url','origin'].every(k => a?.[k] === b?.[k]);
}
