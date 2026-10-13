(() => {
  'use strict';
  if (typeof mitt !== 'function') throw Error('mitt must load before the second Classic asset');
  globalThis.ImportClassicProbe = {order: ['mitt', 'second'], create: () => mitt()};
})();
