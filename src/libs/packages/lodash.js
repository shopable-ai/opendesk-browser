import get from 'lodash-es/get.js';
import has from 'lodash-es/has.js';
import words from 'lodash-es/words.js';
import trim from 'lodash-es/trim.js';
import uniq from 'lodash-es/uniq.js';
import chunk from 'lodash-es/chunk.js';
import escape from 'lodash-es/escape.js';
import truncate from 'lodash-es/truncate.js';

// Audited 8-method API only. No template, set or arbitrary Lodash exports.
export function registerLodash(scope=globalThis) {
  const register=scope[Symbol.for('opendesk.libs.register.v1')];
  if(typeof register!=='function')throw new Error('E_BUILTIN_NOT_READY');
  register('lodash','4.18.1',Object.freeze({get,has,words,trim,uniq,chunk,escape,truncate}));
}
