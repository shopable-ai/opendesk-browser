import {serveXmindFrame} from '../src/xmind-frame-child.js';
import {checkedIdentity, validKey, extensionOrigin, bootstrapMessage, matchesBootstrap} from './bootstrap.js';

export function startSandbox({window, document, serve = serveXmindFrame}) {
  const config = JSON.parse(decodeURIComponent(window.location.hash.slice(1)));
  const identity = checkedIdentity(config.identity), {channelId, key} = config;
  const origin = extensionOrigin(window.location.href);
  if (window.parent === window || !validKey(channelId) || !validKey(key) ||
      !origin.startsWith('chrome-extension://')) throw new Error('E_XMIND_BOOTSTRAP');
  let server, connected = false;
  const notify = kind => window.parent.postMessage(
    bootstrapMessage(kind, channelId, identity, {key}), origin);
  const receive = event => {
    if (connected || event.source !== window.parent || event.origin !== origin ||
        !matchesBootstrap(event.data, 'sandbox-connect', channelId, identity) ||
        event.data.key !== key || event.ports?.length !== 1) return;
    connected = true;
    window.removeEventListener('message', receive);
    server = serve({port: event.ports[0], identity, window, canvas: document.getElementById('canvas')});
    notify('sandbox-connected');
  };
  const destroy = () => {
    connected = true;
    window.removeEventListener('message', receive);
    return server?.destroy();
  };
  window.addEventListener('message', receive);
  window.addEventListener('pagehide', () => {
    Promise.resolve(destroy()).catch(error => console.error('E_XMIND_CLEANUP', error));
  }, {once: true});
  notify('sandbox-ready');
  return {destroy};
}

if (globalThis.document) startSandbox({window, document});
