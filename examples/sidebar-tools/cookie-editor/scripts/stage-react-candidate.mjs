// Build the configured React tool through the canonical packer; no staged fork.
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {buildSidebarTool} from '../../../../scripts/build-sidebar-tool.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=resolve(root,'../../../artifacts/sidebar-tools/cookie-editor/candidate.opendesk-tool.json');
console.log(JSON.stringify(await buildSidebarTool(root,{out})));
