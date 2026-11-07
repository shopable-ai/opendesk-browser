import {requireFramePort} from '../src/xmind-frame-protocol.js';
import {BOOTSTRAP, CHATGPT_ORIGIN, validKey, checkedIdentity,
  bootstrapMessage, matchesBootstrap} from './bootstrap.js';

export function startRelay({window, document, runtime}) {
  const channelId = window.location.hash.slice(1);
  if (window.parent === window || !validKey(channelId)) throw new Error('E_XMIND_BOOTSTRAP');
  const registration = runtime.connect({name: BOOTSTRAP + ':relay'});
  const sandbox = document.createElement('iframe');
  sandbox.title = 'XMind renderer';
  // Manifest sandbox supplies the opaque origin and denies extension APIs.
  let identity, secret, key, port, childReady = false, sent = false, destroyed = false;
  const tellParent = kind => window.parent.postMessage(
    bootstrapMessage(kind, channelId, identity), CHATGPT_ORIGIN);
  const attach = () => {
    if (!port || !childReady || sent || destroyed) return;
    sent = true;
    // Opaque sandbox origins require '*'; this exact child WindowProxy and
    // the private port are the destination. No broadcast or page data event.
    sandbox.contentWindow.postMessage(bootstrapMessage('sandbox-connect', channelId, identity, {key}),
      '*', [port]);
    port = null;
  };
  const receive = event => {
    if (destroyed || !identity) return;
    if (event.source === window.parent && event.origin === CHATGPT_ORIGIN &&
        matchesBootstrap(event.data, 'connect', channelId, identity) &&
        event.data.secret === secret && event.ports?.length === 1 && !port && !sent) {
      port = requireFramePort(event.ports[0]); attach();
    } else if (event.source === sandbox.contentWindow && event.origin === 'null' &&
        event.data?.key === key) {
      if (matchesBootstrap(event.data, 'sandbox-ready', channelId, identity) && !childReady) {
        childReady = true; tellParent('relay-ready'); attach();
      } else if (sent && matchesBootstrap(event.data, 'sandbox-connected', channelId, identity)) {
        registration.onDisconnect.removeListener(disconnect);
        registration.onMessage.removeListener(authorized);
        registration.disconnect();
        tellParent('connected');
        window.removeEventListener('message', receive);
      }
    }
  };
  const authorized = message => {
    if (identity || message?.kind !== 'authorized' || message.channelId !== channelId ||
        !validKey(message.secret)) return;
    identity = checkedIdentity(message.identity); secret = message.secret; key = window.crypto.randomUUID();
    sandbox.src = runtime.getURL('sandbox.html') + '#' + encodeURIComponent(JSON.stringify({channelId, identity, key}));
    document.body.append(sandbox);
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    window.removeEventListener('message', receive);
    window.removeEventListener('pagehide', destroy);
    registration.onMessage.removeListener(authorized);
    registration.onDisconnect.removeListener(disconnect);
    try { registration.disconnect(); }
    finally { port?.close(); sandbox.remove(); }
  };
  const disconnect = () => { if (identity) tellParent('failed'); destroy(); };
  registration.onMessage.addListener(authorized);
  registration.onDisconnect.addListener(disconnect);
  window.addEventListener('message', receive);
  window.addEventListener('pagehide', destroy, {once: true});
  registration.postMessage({channelId});
  return {destroy};
}

if (globalThis.chrome?.runtime && globalThis.document) startRelay({window, document, runtime: chrome.runtime});
