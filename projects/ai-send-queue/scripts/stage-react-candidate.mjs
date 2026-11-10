// Stage one portable v2 Tool using the canonical packer (including its Page compiler).
// This does not install, grant Page rights, or claim live Sidebar synchronization.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {buildSidebarTool} from '../../../scripts/build-sidebar-tool.mjs';
import {verifySidebarToolBackground} from '../../../src/ui/sidebar-tools/package.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=process.argv[2]||'artifacts/sidebar-tools/ai-send-queue/react-candidate.opendesk-tool.json';
const [config,program]=await Promise.all(['tool.config.json','package.json'].map(async name=>
  JSON.parse(await readFile(new URL('../'+name,import.meta.url),'utf8'))));
assert.equal(config.version,program.version,'Tool config and Page project versions must match');
const result=await buildSidebarTool(root,{out});
assert.equal(result.validated,true);
assert.equal(result.installed,false);
const tool=await verifySidebarToolBackground(JSON.parse(await readFile(result.output,'utf8')));
assert.equal(tool.format,'opendesk.sidebar-tool.v2');
assert.equal(tool.id,'ai-send-queue');
assert.equal(tool.version,config.version);
assert.deepEqual([...tool.capabilities].sort(),['currentPage.read','page.module']);
assert.equal(tool.pageModule.programId,'app.'+tool.id);
assert.equal(tool.pageModule.programId,program.opendesk.id);
assert.equal(tool.pageModule.version,program.version);
assert.equal(tool.pageModule.revision,config.pageModule.revision);
console.log(JSON.stringify({status:'SEND_QUEUE_V2_CANDIDATE_ONLY',out:result.output,
  bytes:result.bytes,id:tool.id,version:tool.version,pageProgramId:tool.pageModule.programId,
  pageRevision:tool.pageModule.revision,sourceHash:tool.pageModule.sourceHash,
  packageHash:tool.pageModule.packageHash,installed:false,nativeTests:'NOT_TESTED'}));
