// Release-owned landing pages only. These rules grant no network, Cookie or proxy access.
// LAN is an explicit development source; production still needs reviewed HTTPS rules.
export const DEVELOPMENT_ACTIVATION_URLS=Object.freeze([
  Object.freeze({origin:'http://127.0.0.1:7898',path:'/activate',parameter:'activation_code'}),
  Object.freeze({origin:'http://192.168.30.3:7899',path:'/activate',parameter:'activation_code'})
]);
