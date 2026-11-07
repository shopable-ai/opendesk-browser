import {bindFrameIdentity, matchesFrameIdentity, XMIND_FRAME_PROTOCOL} from '../src/xmind-frame-protocol.js';

export const BOOTSTRAP = 'chatgpt-mindmap.standalone.v1';
export const CHATGPT_ORIGIN = 'https://chatgpt.com';
export const validKey = value => typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export const extensionOrigin = url => {
  const parsed = new URL(url);
  return parsed.protocol + '//' + parsed.host;
};
export function bootstrapMessage(kind, channelId, identity, fields = {}) {
  return {bootstrap: BOOTSTRAP, protocol: XMIND_FRAME_PROTOCOL, kind, channelId, ...identity, ...fields};
}
export function matchesBootstrap(data, kind, channelId, identity) {
  return data?.bootstrap === BOOTSTRAP && data.kind === kind &&
    data.channelId === channelId && matchesFrameIdentity(data, identity);
}
export function checkedIdentity(value) {
  const identity = bindFrameIdentity(value);
  if (identity.instanceId.length > 128 || !validKey(identity.sessionId)) {
    throw new Error('E_XMIND_FRAME_IDENTITY');
  }
  return identity;
}
