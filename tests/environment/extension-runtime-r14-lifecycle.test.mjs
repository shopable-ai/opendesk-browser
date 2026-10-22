import test from 'node:test';
import assert from 'node:assert/strict';
import {setInstalledSidebarToolEnabled,cleanupUninstalledToolLocked,TOOL_CLEANUP_STORE}
  from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_FORMAT} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE}
  from '../../src/ui/sidebar-tools/lifecycle.js';
import {FOCUS_ID,FOCUS_RULE_FIRST,FOCUS_SESSION,FOCUS_STORE,FOCUS_ALARM}
  from '../../examples/sidebar-tools/stay-focus/trusted/policy.js';
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
  const session=new Map([[FOCUS_SESSION,'old-session']]);
  const alarms=new Map([[FOCUS_ALARM,{periodInMinutes:0.5}],['peer-alarm',{periodInMinutes:1}]]);
  const writes=[];
  let failures=0;
  const api={
    runtime:{async sendMessage(message){
      if(message?.protocol==='opendesk.foundation.v1'&&message.type==='cleanupUninstalledToolSchedules')
        return {ok:true,data:{toolId:message.payload.toolId,schedulesRetired:true,alarmsCleared:true}};
    }},
    storage:{local:{
      async get(input){
        const keys=typeof input==='string'?[input]:Array.isArray(input)?input:[...state.keys()];
        return Object.fromEntries(keys.filter(key=>state.has(key)).map(key=>[key,structuredClone(state.get(key))]));
      },
      async set(values){
        writes.push(structuredClone(values));
        for(const [key,value] of Object.entries(values))state.set(key,structuredClone(value));
      },
      async remove(key){state.delete(key);}
    },session:{
      async get(key){return session.has(key)?{[key]:session.get(key)}:{};},
      async remove(key){session.delete(key);}
    }},
    alarms:{
      async get(name){return alarms.get(name);},
      async clear(name){return alarms.delete(name);}
    },
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
  return {state,session,alarms,rules,writes,api,toggle,failNext:()=>{failures++;}};
}
test('R1.4 failed native STOP remains disabled and repeated STOP clears only owned DNR',async()=>{
  const f=fixture();f.failNext();
  await assert.rejects(f.toggle(false),/transient Chrome DNR failure/);
  assert.equal(f.state.get(SIDEBAR_TOOL_ENABLE_STORE)[FOCUS_ID],false);
  assert.ok(f.rules.some(row=>row.id===focusRule.id));
  const result=await f.toggle(false);
  assert.deepEqual(result,{enabled:false,cleanupAttempted:true});
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
test('R1.4 native uninstall recovery removes only Stay Focus own session and alarm',async()=>{
  const f=fixture();
  f.state.set(SIDEBAR_TOOL_STORE,[]);
  f.state.set(TOOL_CLEANUP_STORE,{[FOCUS_ID]:{version:focusTool.version,createdAt:10}});
  f.state.set(FOCUS_STORE,{enabled:false});
  let interrupted=true;
  const remove=f.api.storage.session.remove;
  f.api.storage.session.remove=async key=>{
    if(interrupted){interrupted=false;throw new Error('session removal interrupted');}
    return remove(key);
  };
  await assert.rejects(cleanupUninstalledToolLocked(f.api,FOCUS_ID),
    {code:'E_TOOL_UNINSTALL_CLEANUP'});
  assert.ok(f.state.get(TOOL_CLEANUP_STORE)[FOCUS_ID]);
  assert.equal(f.session.get(FOCUS_SESSION),'old-session');
  assert.equal(f.alarms.has(FOCUS_ALARM),false);
  assert.equal(f.alarms.has('peer-alarm'),true);
  assert.deepEqual(f.rules,[peerRule]);
  assert.deepEqual(await cleanupUninstalledToolLocked(f.api,FOCUS_ID),
    {state:'cleaned',toolId:FOCUS_ID});
  assert.equal(f.session.has(FOCUS_SESSION),false);
  assert.equal(f.state.has(FOCUS_STORE),false);
  assert.deepEqual(f.state.get(TOOL_CLEANUP_STORE),{});
  assert.equal(f.alarms.has('peer-alarm'),true);
  assert.deepEqual(f.rules,[peerRule]);
});
