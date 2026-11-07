// Test-only tripwires; never substitute the CLI, service, stores or HTTP handlers.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import https from 'node:https';
import {register, syncBuiltinESMExports} from 'node:module';
import {fileURLToPath} from 'node:url';

const audit = process.env.USAGE_TEST_AUDIT;
const record = event => fs.appendFileSync(audit, `${event}\n`);
const reject = event => { record(event); throw Error(`STANDALONE_GUARD_${event}`); };
// Even a caught Native import attempt must fail the parent's audit assertion.
register(`data:text/javascript,${encodeURIComponent(`
  import {appendFileSync} from 'node:fs';
  export async function resolve(specifier, context, nextResolve) {
    if (/native-connection|native-service-adapter|managed-services/.test(specifier)) {
      appendFileSync(${JSON.stringify(audit)}, 'native-import\\n');
      throw Error('STANDALONE_GUARD_native-import');
    }
    return nextResolve(specifier, context);
  }
`)}`, import.meta.url);

function checkPath(path) {
  const value = path instanceof URL ? fileURLToPath(path) : String(path);
  // Includes the intentionally nonexistent configured source and installation
  // directories in the isolated HOME. Node permissions also deny real HOME.
  if (/auth\.json|\.codex|native-messaging|installation|credential/i.test(value)) reject('credential-read');
}
for (const [object, names] of [[fs, ['readFile', 'readFileSync', 'open', 'openSync']],
  [fsp, ['readFile', 'open']]]) {
  for (const name of names) {
    const original = object[name];
    object[name] = function(path, ...args) { checkPath(path); return original.call(this, path, ...args); };
  }
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  // Node's internal reader is the only permitted client connection. All
  // hostname resolution, Unix sockets and upstream connections are rejected.
  if (!options || typeof options !== 'object' || options.path || options.host !== '127.0.0.1') reject('outbound-connect');
  return connect.apply(this, args);
};
https.request = https.get = () => reject('upstream-request');
const fetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') reject('upstream-request');
  return fetch(input, options);
};
syncBuiltinESMExports();
record('guard-ready');
