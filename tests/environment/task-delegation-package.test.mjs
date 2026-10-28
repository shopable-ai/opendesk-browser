import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildSidebarTool} from '../../scripts/build-sidebar-tool.mjs';
import {validateSidebarToolPackage,serializeSidebarToolPackage,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {taskDelegationReview} from '../../src/platform/tasks/delegation-contract.js';

const pin={taskId:'fixed.capture',version:'1.0.0',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64)};
const tool={format:'opendesk.sidebar-tool.v2',id:'fixed-task-test',version:'1.0.0',title:'Fixed Task',
  description:'Delegation',html:'<main>Run</main>',css:'',js:'void 0;',capabilities:['tasks.run'],
  requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},delegatedTasks:[pin]};

test('Task delegation package requires explicit v2 capability and a closed, nonempty fixed pin list',()=>{
  assert.deepEqual(validateSidebarToolPackage(tool).delegatedTasks,[pin]);
  for(const candidate of [
    {...tool,format:'opendesk.sidebar-tool.v1'},
    {...tool,capabilities:[]},
    {...tool,delegatedTasks:undefined},
    {...tool,delegatedTasks:[]},
    {...tool,delegatedTasks:[pin,pin]},
    {...tool,delegatedTasks:[{...pin,installationId:'unreviewed'}]},
    {...tool,delegatedTasks:[{...pin,contentHash:'latest'}]}
  ])assert.throws(()=>validateSidebarToolPackage(candidate));
});

test('Task pins participate in canonical package identity and readable installation review',async()=>{
  const reordered={contentHash:pin.contentHash,manifestHash:pin.manifestHash,version:pin.version,taskId:pin.taskId};
  assert.equal(serializeSidebarToolPackage(tool),serializeSidebarToolPackage({...tool,delegatedTasks:[reordered]}));
  const original=await sidebarToolPackageHash(tool);
  for(const key of Object.keys(pin)){
    const replacement={taskId:'other.capture',version:'2.0.0',manifestHash:'c'.repeat(64),contentHash:'d'.repeat(64)}[key];
    assert.notEqual(await sidebarToolPackageHash({...tool,delegatedTasks:[{...pin,[key]:replacement}]}),original);
  }
  for(const value of Object.values(pin))assert.ok(taskDelegationReview(tool).includes(value));
});

test('original Sidebar App builder preserves reviewed pins and rejects unbounded delegation',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'opendesk-delegated-task-'));
  try{
    const {html,css,js,...meta}=tool;
    const config={...meta,files:{html:'index.html',css:'style.css',js:'main.js'},assets:[]};
    await Promise.all([
      writeFile(join(dir,'tool.config.json'),JSON.stringify(config)),
      writeFile(join(dir,'index.html'),html),writeFile(join(dir,'style.css'),css),writeFile(join(dir,'main.js'),js)
    ]);
    const out=join(dir,'candidate.json');await buildSidebarTool(dir,{out});
    const built=validateSidebarToolPackage(JSON.parse(await readFile(out,'utf8')));
    assert.deepEqual(built.delegatedTasks,[pin]);assert.deepEqual(built.capabilities,['tasks.run']);
    await writeFile(join(dir,'tool.config.json'),JSON.stringify({...config,delegatedTasks:[]}));
    await assert.rejects(buildSidebarTool(dir,{out}));
  }finally{await rm(dir,{recursive:true,force:true});}
});
