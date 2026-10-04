import {PROTOCOL} from '../environment.js';

export function initHealthAgent() {
// Single isolated-world listener even after repeated file injection. No DOM mutation or selection.
const key = '__openDeskEnvironmentHealthV1';
let agent = globalThis[key];
if (!agent) {
  agent = {instanceId: crypto.randomUUID()};
  agent.listener = (message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message?.protocol !== PROTOCOL || message.type !== 'HEALTH' ||
        message.agentInstanceId !== agent.instanceId || typeof message.requestId !== 'string') return false;
    respond({protocol: PROTOCOL, requestId: message.requestId, agentInstanceId: agent.instanceId,
      origin: location.origin, readyState: document.readyState});
    return false;
  };
  chrome.runtime.onMessage.addListener(agent.listener);
  globalThis[key] = agent;
}
// Promise completion lets the worker observe authentic sender metadata before sending its ping.
chrome.runtime.sendMessage({protocol: PROTOCOL, type: 'AGENT_READY', agentInstanceId: agent.instanceId})
  .then(reply => { if (!reply?.ok) throw new Error(reply?.error?.code || 'E_TARGET'); });

}
