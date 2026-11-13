import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {digestUtf8} from '../../src/platform/protocol.js';
import {assertPackagedTask,BUILTIN_TASK_RELEASES,OPTIONAL_TASK_RELEASES,PACKAGED_TASK_RESOURCES}
  from '../../src/platform/tasks/builtin-releases.js';

// Git blob SHA-1 witnesses captured from main BEFORE the ownership migration.
// Package manifestHash/sourceHash and runtime tasks/builtin paths are unchanged.
// A source or package change requires a NEW reviewed Task version, not a re-pin.
const fixtures=[
  ['baidu.search/src/baidu-search-top3.js',
   'baidu.search/releases/baidu.search.top3.v1.opendesk-task.json',
   'f1268505de622c3aa5725c5be6049002e524b707',
   '7ed543cb4c46a688b6fb2f1a6943a10065b6c172'],
  ['google.search/src/google-search-top3.js',
   'google.search/releases/google.search.top3.v1.opendesk-task.json',
   '85bbaab356792903ced6423aa65f6f80a9dc15ca',
   'acc7df905e0376a94385b7176c34a4081c536612'],
  ['chatgpt.conversation.create/src/chatgpt-conversation-create.js',
   'chatgpt.conversation.create/releases/chatgpt.conversation.create.v1.opendesk-task.json',
   'a023e08e619da4be19af776e861bc36e4b04ce7f',
   '28334477c3b6667f64f066ea027d20724e5d15ae'],
  ['chatgpt.conversation.create/src/chatgpt-conversation-create-v0.2.js',
   'chatgpt.conversation.create/releases/chatgpt.conversation.create.0.2.0.opendesk-task.json',
   '340c64d03e2960ede5ce35d6fec78fadfd90dcd3',
   '4e2ebfd8261983fdad8a73f8c3896ee6dcc504f8'],
  ['chatgpt.conversation.create/src/chatgpt-conversation-create-v0.2.1.js',
   'chatgpt.conversation.create/releases/chatgpt.conversation.create.0.2.1.opendesk-task.json',
   '3778212e9d01bbeda63d84cc87891c75e1e81ae3',
   '1d2fdbc8ceac464acae4de976faacd28a37e8571'],
  ['chatgpt.conversation.create/src/chatgpt-conversation-create-v0.2.2.js',
   'chatgpt.conversation.create/releases/chatgpt.conversation.create.0.2.2.opendesk-task.json',
   '3e37727128401726e505ca866415693c0b94af4d',
   '44a44b8bb88a88bc961980fdbcc103e730564cbf'],
  ['chatgpt.conversation.create/src/chatgpt-conversation-create-v0.3.js',
   'chatgpt.conversation.create/releases/chatgpt.conversation.create.0.3.0.opendesk-task.json',
   '20724c846594191d41dca3096ec12cff6a568b5d',
   '6b5a6a9715c94f6ea92b2715f74a18d90d903f80']
];
const sha=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const path=p=>resolve('task-packs',p);

test('all seven reviewed Task sources and package bytes retain pre-migration Git blob identities',async()=>{
  for(const [src,pkgPath,srcSha,pkgSha] of fixtures){
    const [js,pkgBytes]=await Promise.all([readFile(path(src)),readFile(path(pkgPath))]);
    assert.equal(sha(js),srcSha,src);
    assert.equal(sha(pkgBytes),pkgSha,pkgPath);
    const pkg=JSON.parse(pkgBytes.toString('utf8'));
    await assertPackagedTask(pkg);
    assert.equal(await digestUtf8(js.toString('utf8')),pkg.manifest.program.sourceHash,src);
    assert.equal(pkg.sourceUtf8,js.toString('utf8'),src);
  }
});

test('directory names never become Task IDs; reviewed identities and private resource paths are stable',()=>{
  assert.deepEqual(BUILTIN_TASK_RELEASES.map(x=>[x.taskId,x.version]),
    [['baidu.search.top3','1.1.5'],['google.search.top3','1.0.3']]);
  assert.deepEqual(OPTIONAL_TASK_RELEASES.map(x=>[x.taskId,x.version]),
    [['chatgpt.conversation.create','0.2.2']]);
  assert.equal(PACKAGED_TASK_RESOURCES.length,fixtures.length);
  for(const row of PACKAGED_TASK_RESOURCES){
    assert.ok(row.sourcePath.startsWith('task-packs/'));
    assert.equal(row.path,`tasks/builtin/${row.taskId}/${row.version}.json`);
  }
});

test('legacy active source copies are absent; one family owns each reviewed file',async()=>{
  const legacy=[
    ...fixtures.slice(0,2).map(([src])=>'examples/tasks/'+src.split('/').at(-1)),
    ...fixtures.slice(0,2).map(([,p])=>'examples/tasks/'+p.split('/').at(-1)),
    ...fixtures.slice(2).map(([src])=>'projects/webflow/src/tasks/'+src.split('/').at(-1)),
    ...fixtures.slice(2).map(([,p])=>'projects/webflow/tasks/'+p.split('/').at(-1))
  ];
  for(const file of legacy)await assert.rejects(stat(file),{code:'ENOENT'});
});
