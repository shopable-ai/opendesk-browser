'use strict';
// webpack embeds this value and excludes the entire source-mode branch.
module.exports = typeof __SCRAPYJS_FINGERPRINT__ !== 'undefined'
  ? () => (__SCRAPYJS_FINGERPRINT__)
  : (typeof process !== 'undefined' && process.versions?.node ? (() => {
    const generate = require('../../scripts/lib/engine-fingerprint.cjs').engineFingerprint;
    const initial = generate();
    return () => {
      const current = generate();
      if (JSON.stringify(current) !== JSON.stringify(initial)) {
        throw Object.assign(new Error('Engine inputs changed after source loading; restart before freezing'), { code: 'ENGINE_MISMATCH' });
      }
      return current;
    };
  })() : () => {
    throw Object.assign(new Error('Engine fingerprint requires Node'), { code: 'UNSUPPORTED_CAPABILITY' });
  });
