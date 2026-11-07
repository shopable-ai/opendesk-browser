import {BOOTSTRAP, CHATGPT_ORIGIN, validKey, checkedIdentity, extensionOrigin} from './bootstrap.js';

// Authenticate bootstrap metadata only. Tree/commands/Blobs never cross runtime
// messaging (Chrome serializes that channel as JSON). No privileged operations.
export function installBootstrapBroker(runtime) {
  const bindings = new Map();
  const connect = port => {
    const sender = port.sender;
    if (sender?.id !== runtime.id || !Number.isInteger(sender.tab?.id) ||
        typeof sender.documentId !== 'string' || !sender.documentId) { port.disconnect(); return; }
    const content = port.name === BOOTSTRAP + ':content';
    const relay = port.name === BOOTSTRAP + ':relay';
    try {
      if ((!content && !relay) || (content && (sender.frameId !== 0 ||
          new URL(sender.url).origin !== CHATGPT_ORIGIN ||
          (sender.origin && sender.origin !== CHATGPT_ORIGIN)))) throw new Error('E_XMIND_BOOTSTRAP');
    } catch { port.disconnect(); return; }
    let binding, handled = false;
    const receive = message => {
      if (handled) return;
      handled = true;
      try {
        if (!validKey(message?.channelId)) throw new Error('E_XMIND_BOOTSTRAP');
        if (content) {
          const identity = checkedIdentity(message.identity);
          if (!validKey(message.secret) || bindings.has(message.channelId) || bindings.size >= 512) {
            throw new Error('E_XMIND_BOOTSTRAP');
          }
          binding = {identity, secret: message.secret, channelId: message.channelId,
            tabId: sender.tab.id, port, relays: new Set()};
          bindings.set(message.channelId, binding);
          port.postMessage({kind: 'registered', channelId: binding.channelId, identity});
        } else {
          binding = bindings.get(message.channelId);
          if (!binding || !Number.isInteger(sender.frameId) || sender.frameId <= 0 || sender.tab.id !== binding.tabId ||
              (sender.origin && sender.origin !== extensionOrigin(runtime.getURL('relay.html'))) ||
              sender.url !== runtime.getURL('relay.html') + '#' + message.channelId) {
            throw new Error('E_XMIND_BOOTSTRAP');
          }
          binding.relays.add(port);
          // Secret stays in isolated JS, trusted relay JS and runtime messages.
          port.postMessage({kind: 'authorized', channelId: binding.channelId,
            identity: binding.identity, secret: binding.secret});
        }
      } catch { port.disconnect(); }
    };
    port.onMessage.addListener(receive);
    port.onDisconnect.addListener(() => {
      port.onMessage.removeListener(receive);
      if (!binding) return;
      if (content && bindings.get(binding.channelId) === binding) {
        bindings.delete(binding.channelId);
        for (const child of binding.relays) child.disconnect();
      } else binding.relays.delete(port);
    });
  };
  runtime.onConnect.addListener(connect);
  return () => {
    runtime.onConnect.removeListener(connect);
    for (const binding of bindings.values()) binding.port.disconnect();
    bindings.clear();
  };
}

if (globalThis.chrome?.runtime?.onConnect) installBootstrapBroker(chrome.runtime);
