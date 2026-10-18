import test from 'node:test';
import assert from 'node:assert/strict';
import {setInstalledSidebarToolEnabled} from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_FORMAT} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE}
  from '../../src/ui/sidebar-tools/lifecycle.js';
import {FOCUS_ID,FOCUS_RULE_FIRST} from '../../examples/sidebar-tools/stay-focus/trusted/policy.js';
import {probeStayFocusService} from '../../examples/sidebar-tools/stay-focus/trusted/tool-host.js';

const focusTool={format:SIDEBAR_TOOL_FORMAT,id:FOCUS_ID,version:'1.0.0',
  title:'Stay Focus',description:'bounded native cleanup regression',
  capabilities:['focus.control'],html:'<main>focus</main>',css:'',js:'void 0;'};
const peerRule={id:50001,priority:1,action:{type:'block'},
  condition:{urlFilter:'foreign.example',resourceTypes:['main_frame']}};
const focusRule={id:FOCUS_RULE_FIRST+1,priority:1,action:{type:'block'},
  condition:{regexFilter:'^https://youtube\\.com/',resourceTypes:['main_frame']}};

function fixture(tool=focusTool){
  const state=new Map([[SIDEBAR_TOOL_STORE,[tool]]]);
  const rules=[structuredClone(peerRule),structuredClone(focusRule)];
  const writes=[];
  let failures=0;
  const api={
    storage:{local:{
      async get(input){
        const keys=typeof input==='string'?[input]:Array.isArray(input)?input:[...state.keys()];
        return Object.fromEntries(keys.filter(key=>state.has(key)).map(key=>[key,structuredClone(state.get(key))]));
      },
      async set(values){
        writes.push(structuredClone(values));
        for(const [key,value] of Object.entries(values))state.set(key,structuredClone(value));
      }
    }},
    permissions:{contains:async()=>true},
    declarativeNetRequest:{
      async getDynamicRules(){return structuredClone(rules);},
      async updateDynamicRules({removeRuleIds=[],addRules=[]}){
        if(failures>0){failures--;throw new Error('transient Chrome DNR failure');}
        for(const id of removeRuleIds){
          const index=rules.findIndex(row=>row.id===id);
          if(index>=0)rules.splice(index,1);
        }
        rules.push(...structuredClone(addRules));
      }
    }
  };
  const lockManager={request:async(_key,work)=>work()};
  const toggle=enabled=>setInstalledSidebarToolEnabled({api,lockManager,tool,enabled});
  return {state,rules,writes,toggle,failNext:()=>{failures++;}};
}
test('R1.4 failed native STOP remains disabled and repeated STOP clears only owned DNR',async()=>{
  const f=fixture();f.failNext();
  await assert.rejects(f.toggle(false),/transient Chrome DNR failure/);
  assert.equal(f.state.get(SIDEBAR_TOOL_ENABLE_STORE)[FOCUS_ID],false);
  assert.ok(f.rules.some(row=>row.id===focusRule.id));
  const result=await f.toggle(false);
  assert.deepEqual(result,{enabled:false,cleanupVerified:true});
  assert.deepEqual(f.rules,[peerRule]);
  assert.equal(f.state.get(TOOL_REVOCATION_EPOCHS_STORE),undefined);
});
test('R1.4 Resume cleans previous native effects before restoring application identity',async()=>{
  const f=fixture();await f.toggle(false);
  f.rules.push(structuredClone(focusRule));
  f.failNext();
  await assert.rejects(f.toggle(true),/transient Chrome DNR failure/);
  assert.equal(f.state.get(SIDEBAR_TOOL_ENABLE_STORE)[FOCUS_ID],false);
  await f.toggle(true);
  assert.equal(f.state.get(SIDEBAR_TOOL_ENABLE_STORE)[FOCUS_ID],true);
  assert.deepEqual(f.rules,[peerRule]);
  assert.match(f.state.get(TOOL_REVOCATION_EPOCHS_STORE)[FOCUS_ID],/^[0-9a-f-]{36}$/);
});
test('R1.4 already-enabled no-op does not rewrite installation authority',async()=>{
  const f=fixture();
  assert.deepEqual(await f.toggle(true),{enabled:true});
  assert.equal(f.writes.length,0);
});
test('R1.4 fixed worker probe rejects foreign package before sending SW messages',async()=>{
  let sent=0;
  const api={runtime:{sendMessage:async()=>{sent++;return {ok:true};}}};
  for(const tool of [{...focusTool,id:'other-tool'},{
    ...focusTool,capabilities:['storage.local']}]){
    await assert.rejects(probeStayFocusService({api,tool}),{code:'E_TOOL_RUNTIME_UNAVAILABLE'});
  }
  assert.equal(sent,0);
});
