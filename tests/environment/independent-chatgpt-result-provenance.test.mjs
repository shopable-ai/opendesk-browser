import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink,readFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';
import {REVIEWED_BUILTIN_TASK_RELEASES} from '../../src/platform/tasks/builtin-releases.js';
import {validateChatGPTCreateResult as sharedSchema}
  from '../../task-packs/chatgpt.conversation.create/contracts/result-v2.js';
import {validateChatGPTCreateResult as webflowSchema}
  from '../../projects/webflow/src/chatgpt-conversation-result.js';
import {reviewedChatGPTCreateBusinessAdapter,verifyInstalledChatGPTDurableResult}
  from '../../task-packs/chatgpt.conversation.create/contracts/installed-result.js';

const sources=[
  'task-packs/chatgpt.conversation.create/contracts/result-v2.js',
  'task-packs/chatgpt.conversation.create/contracts/installed-result.js'
];
const describe=(target,path,root=process.cwd())=>describeBundle({root,chunk:{
  fileName:target,modules:{[resolve(root,path)]:{renderedLength:1,originalLength:1}}
}});

test('two audited Task contracts, not arbitrary task-packs code, compile into SW and Task UI',()=>{
  for(const path of sources){
    for(const target of ['sw.js','ui/tool-shell.js'])
      assert.match(describe(target,path).modules[0].reviewedFirstPartyBlob,/^[a-f0-9]{40}$/);
    for(const target of ['agents/chatgpt-fixed-bridge.js','agents/page-relay.js',
      'native-agent/transport.js','ui/sidebar-tool-host.js'])
      assert.throws(()=>describe(target,path),/cannot enter a privileged fixed bundle/);
  }
  for(const path of [
    'task-packs/chatgpt.conversation.create/src/chatgpt-conversation-create-v0.2.2.js',
    'task-packs/chatgpt.conversation.create/contracts/unreviewed.js',
    'task-packs/baidu.search/src/baidu-search-top3.js'])
    assert.throws(()=>describe('sw.js',path),/cannot enter a privileged fixed bundle/);
});

test('shared contract cannot be substituted by byte drift or symlink',async t=>{
  const root=await realpath(await mkdtemp(resolve(tmpdir(),'task-result-source-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const path of sources){
    const file=resolve(root,path),original=await readFile(path);
    await mkdir(dirname(file),{recursive:true});await writeFile(file,original);
    assert.doesNotThrow(()=>describe('sw.js',path,root));
    await writeFile(file,Buffer.concat([original,Buffer.from('\n// changed\n')]));
    assert.throws(()=>describe('sw.js',path,root),/review and re-pin/);
    await rm(file);await symlink(resolve(path),file);
    assert.throws(()=>describe('sw.js',path,root),/must not be a symlink/);
  }
});

test('Subagent and WebFlow consume the same strict 0.2.x Task schema and immutable pin',async()=>{
  assert.equal(webflowSchema,sharedSchema);
  const subagent=await readFile('projects/subagent/trusted/result.js','utf8');
  assert.match(subagent,/task-packs\/chatgpt\.conversation\.create\/contracts\/installed-result\.js/);
  assert.doesNotMatch(subagent,/projects\/webflow\//);
  const release=REVIEWED_BUILTIN_TASK_RELEASES.find(row=>
    row.taskId==='chatgpt.conversation.create'&&row.version==='0.2.2');
  assert.ok(release);
  const installation={version:release.version,manifestHash:release.manifestHash,
    contentHash:release.sourceHash,scriptId:'task:chatgpt.conversation.create:0.2.2',
    revision:1,installationId:'11111111-1111-4111-8111-111111111111',generation:1};
  const request={taskId:release.taskId,targetUrl:'https://chatgpt.com/',
    installation,args:{prompt:'test',send:true},requestId:'original-request'};
  const adapter=reviewedChatGPTCreateBusinessAdapter(request);
  assert.equal(typeof adapter.verify,'function');
  assert.throws(()=>sharedSchema({status:'reply-complete'},request.args),{code:'E_CHAT_CREATE_RESULT'});
  assert.throws(()=>verifyInstalledChatGPTDurableResult(null,'run-id',installation,request),{code:'E_BRIDGE_DURABLE'});
  assert.throws(()=>reviewedChatGPTCreateBusinessAdapter({...request,
    installation:{...installation,contentHash:'0'.repeat(64)}}),{code:'E_BRIDGE_RESULT'});
  assert.throws(()=>reviewedChatGPTCreateBusinessAdapter({...request,
    installation:{...installation,version:'0.3.0'}}),{code:'E_BRIDGE_RESULT'});
});
