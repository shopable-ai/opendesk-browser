import {bindFrameIdentity, frameError} from '../src/xmind-frame-protocol.js';
import {BOOTSTRAP, bootstrapMessage, matchesBootstrap, extensionOrigin} from './bootstrap.js';

export function createStandaloneFrameFactory({window, document, runtime, timeoutMs = 8000}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw frameError('E_XMIND_FRAME_TIMEOUT');
  return ({canvas, identity, signal}) => new Promise((resolve, reject) => {
    const binding = bindFrameIdentity(identity);
    if (signal?.aborted) { reject(frameError('E_XMIND_FRAME_DESTROYED')); return; }
    const channelId = window.crypto.randomUUID(), secret = window.crypto.randomUUID();
    const frame = document.createElement('iframe'), channel = new window.MessageChannel();
    const origin = extensionOrigin(runtime.getURL('relay.html'));
    let registration, timer, settled = false, destroyed = false, sent = false;
    frame.title = 'XMind 独立沙箱';
    frame.referrerPolicy = 'no-referrer';
    frame.style.cssText = 'display:block;width:100%;height:100%;border:0;background:transparent';
    const removeHandshake = () => {
      window.clearTimeout(timer);
      window.removeEventListener('message', receive);
      signal?.removeEventListener('abort', abort);
    };
    const destroy = () => {
      if (destroyed) return;
      destroyed = true; removeHandshake();
      registration?.onMessage.removeListener(registered);
      registration?.onDisconnect.removeListener(disconnected);
      try { registration?.disconnect(); }
      finally { channel.port1.close(); channel.port2.close(); frame.remove(); }
    };
    const fail = code => {
      if (settled) return;
      settled = true; destroy(); reject(frameError(code));
    };
    const abort = () => fail('E_XMIND_FRAME_DESTROYED');
    const disconnected = () => {
      if (!settled) fail('E_XMIND_FRAME_CHANNEL');
      else if (!destroyed) {
        channel.port1.dispatchEvent(new window.Event('messageerror'));
        destroy();
      }
    };
    const registered = message => {
      if (message?.kind !== 'registered' || message.channelId !== channelId ||
          JSON.stringify(message.identity) !== JSON.stringify(binding)) return;
      registration.onMessage.removeListener(registered);
      if (destroyed) return;
      frame.src = runtime.getURL('relay.html') + '#' + channelId;
      canvas.append(frame);
    };
    const receive = event => {
      if (event.source !== frame.contentWindow || event.origin !== origin || destroyed) return;
      if (matchesBootstrap(event.data, 'relay-ready', channelId, binding) && !sent) {
        sent = true;
        frame.contentWindow.postMessage(bootstrapMessage('connect', channelId, binding, {secret}),
          origin, [channel.port2]);
      } else if (!settled && sent && matchesBootstrap(event.data, 'connected', channelId, binding)) {
        settled = true;
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        // Bootstrap is complete. A suspended MV3 worker must not own or tear
        // down an already authenticated renderer's document/MessagePort.
        registration.onMessage.removeListener(registered);
        registration.onDisconnect.removeListener(disconnected);
        registration.disconnect();
        resolve(Object.freeze({port: channel.port1, destroy}));
      } else if (matchesBootstrap(event.data, 'failed', channelId, binding)) {
        if (!settled) fail('E_XMIND_FRAME_CHANNEL');
        else {
          channel.port1.dispatchEvent(new window.Event('messageerror'));
          destroy();
        }
      }
    };
    window.addEventListener('message', receive);
    signal?.addEventListener('abort', abort, {once: true});
    timer = window.setTimeout(() => fail('E_XMIND_FRAME_TIMEOUT'), timeoutMs);
    try {
      registration = runtime.connect({name: BOOTSTRAP + ':content'});
      registration.onMessage.addListener(registered);
      registration.onDisconnect.addListener(disconnected);
      registration.postMessage({channelId, identity: binding, secret});
    } catch { fail('E_XMIND_FRAME_CHANNEL'); }
  });
}
