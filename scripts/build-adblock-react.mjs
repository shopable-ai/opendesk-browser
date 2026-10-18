// Single audited React 19 compiler for the installable AdBlock UI.
// Compiled assets are never edited by hand and do not contain a second React runtime.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'acorn';
import {build} from 'vite';

const root=fileURLToPath(new URL('../examples/sidebar-tools/adblock/',import.meta.url));
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
await build({configFile:resolve(root,'vite.config.mjs'),logLevel:'warn',clearScreen:false});
const [js,css]=await Promise.all([
  readFile(resolve(root,'src/main.js'),'utf8'),
  readFile(resolve(root,'src/style.css'),'utf8')
]);
assert.ok(js.length>500&&css.length>300,'AdBlock React build produced empty assets');
parse(js,{ecmaVersion:'latest',sourceType:'script'});
for(const name of ['adblock.enable','adblock.disable','adblock.status',
  'adblock.site.set','adblock.site.restore','opendesk-page-changed',
  'opendesk-tool-state-changed','E_ADBLOCK_REACT_ROOT'])
  assert.ok(js.includes(name),'compiled React lost business operation: '+name);
assert.ok(js.includes('OpenDeskPageReact')&&js.includes('OpenDeskSidebarUI'),
  'React 19 and Shared UI must be host-owned externals');
assert.doesNotMatch(js,/chrome\\.declarativeNetRequest|chrome\\.permissions/);
console.log(JSON.stringify({status:'COMPILED_NOT_INSTALLED',version:JSON.parse(
  await readFile(resolve(root,'tool.config.json'),'utf8')).version,
  files:{'src/main.js':{bytes:Buffer.byteLength(js),sha256:sha256(js)},
    'src/style.css':{bytes:Buffer.byteLength(css),sha256:sha256(css)}}}));
