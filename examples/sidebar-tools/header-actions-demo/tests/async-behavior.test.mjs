import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {parse} from 'acorn';
import {parseHTML} from 'linkedom';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const [main,html,entry]=await Promise.all([read('../src/main.js'),read('../src/index.html'),read('../preview/entry.tsx')]);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const config={alias:'已保存',compact:true};
const receipt=(value=config,etag='etag-1')=>({value,etag});

function app(t){
  const {document,window}=parseHTML('<html><body>'+html+'</body></html>');
  const field=id=>document.getElementById('demo-'+id);
  const calls=[],states=[];
  const tool={root:document.body,surface:'page',initialPage:{view:'settings',section:'preferences'},
    setState:state=>states.push({...state}),
    request(action,args){
      let resolve,reject;
      const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
      calls.push({action,args:structuredClone(args),resolve,reject});
      return promise;
    }};
  runInNewContext(main,{OpenDeskTool:tool,document,window,crypto:globalThis.crypto});
  t.after(()=>window.dispatchEvent(new window.Event('pagehide')));
  const fire=(id,type)=>field(id).dispatchEvent(new window.Event(type));
  // linkedom does not implement native disabled-control interaction suppression.
  const edit=(id,value)=>{
    if(field(id).disabled)return;
    field(id)[id==='compact'?'checked':'value']=value;
    fire(id,id==='compact'?'change':'input');
  };
  const locked=value=>{
    assert.equal(field('alias').disabled,value,'alias lock');
    assert.equal(field('compact').disabled,value,'compact lock');
    assert.equal(states.at(-1).busy,value,'reported busy');
  };
  return {field,calls,states,fire,edit,locked};
}

test('deferred initial and explicit reads lock both fields, then allow a draft without implicit saving',async t=>{
  const a=app(t);
  a.locked(true);
  a.edit('alias','读取期间输入');a.edit('compact',false);
  assert.equal(a.calls.length,1);
  a.calls[0].resolve(receipt());await flush();
  a.locked(false);
  assert.equal(a.field('alias').value,config.alias);
  assert.equal(a.field('compact').checked,true);
  a.fire('reload','click');a.locked(true);
  a.calls[1].resolve(receipt({alias:'其他实例',compact:false},'etag-2'));await flush();
  a.locked(false);
  assert.equal(a.field('alias').value,'其他实例');
  a.edit('alias','新草稿');a.edit('compact',true);
  assert.equal(a.states.at(-1).dirty,true);
  a.fire('reload','click');
  assert.equal(a.calls.length,2,'dirty reload cannot discard or write a draft');
  assert.equal(a.field('alias').value,'新草稿');
});

test('deferred save and verification read keep both fields locked until the exact draft is confirmed',async t=>{
  const a=app(t);
  a.calls[0].resolve(receipt());await flush();
  a.edit('alias','保存草稿');a.edit('compact',false);
  a.fire('save','click');a.locked(true);
  assert.deepEqual(a.calls[1].args,{key:'header-actions-demo.preferences.v1',value:{alias:'保存草稿',compact:false},ifMatch:'etag-1'});
  a.edit('alias','不能丢失的输入');a.edit('compact',true);
  a.fire('save','click');a.fire('reset','click');
  assert.equal(a.calls.length,2,'busy handlers do not replay reads or writes');
  a.calls[1].resolve({saved:true});await flush();
  a.locked(true);
  assert.equal(a.calls[2].action,'storage.get');
  a.calls[2].resolve(receipt({alias:'保存草稿',compact:false},'etag-2'));await flush();
  a.locked(false);
  assert.equal(a.field('alias').value,'保存草稿');
  assert.equal(a.field('compact').checked,false);
  assert.equal(a.states.at(-1).dirty,false);
  a.edit('alias','下一次草稿');a.edit('compact',true);
  assert.equal(a.states.at(-1).dirty,true);
  assert.equal(a.calls.length,3,'editing after completion does not auto-save');
});

test('unknown save unlocks fields, retains the draft and never replays the write',async t=>{
  const a=app(t);
  a.calls[0].resolve(receipt());await flush();
  a.edit('alias','保留草稿');a.edit('compact',false);
  a.fire('save','click');a.locked(true);
  a.calls[1].reject(Error('写入结果未知'));await flush();await flush();
  a.locked(false);
  assert.equal(a.states.at(-1).dirty,true);
  assert.equal(a.field('alias').value,'保留草稿');
  assert.equal(a.field('compact').checked,false);
  assert.match(a.field('result').textContent,/不会自动重放/);
  assert.equal(a.calls.length,2);
});

test('failed deferred read unlocks fields and leaves existing inputs intact',async t=>{
  const a=app(t);
  a.calls[0].resolve(receipt());await flush();
  a.fire('reload','click');a.locked(true);
  a.calls[1].reject(Error('读取失败'));await flush();
  a.locked(false);
  assert.equal(a.field('alias').value,config.alias);
  assert.equal(a.field('compact').checked,true);
  assert.equal(a.calls.length,2);
});

async function preview(open){
  // Execute the actual entry; replace imported framework dependencies only.
  // No second Host, browser, server or installation is created by this fixture.
  const imports=parse(entry,{ecmaVersion:'latest',sourceType:'module'}).body.filter(node=>node.type==='ImportDeclaration');
  let executable=entry;
  for(const node of imports.reverse())executable=executable.slice(0,node.start)+executable.slice(node.end);
  const location={href:'http://demo.local/',origin:'http://demo.local',assignments:[],assign(url){this.assignments.push(url);}};
  const status={textContent:''};
  let api;
  await runInNewContext('(async()=>{'+executable+'})()',{URL,Response,structuredClone,location,
    document:{getElementById:()=>status,documentElement:{dataset:{}}},
    window:{open,addEventListener(){},removeEventListener(){}},
    fetch:async path=>path==='/tool.json'?{json:async()=>({id:'header-actions-demo'})}:{text:async()=>''},
    mountSidebarApp:()=>({renderNavigation(){},dispose(){}}),createSidebarToolsView:()=>({dispose(){}}),
    createSidebarTools:options=>{api=options.api;return {ready:Promise.resolve(),setVisible(){},async openTool(){},dispose(){}};},
    SIDEBAR_TOOL_STORE:'tools',SIDEBAR_TOOL_ENABLE_STORE:'enabled',TOOL_REVOCATION_EPOCHS_STORE:'epochs',
    sidebarToolStorageKey:id=>'storage:'+id});
  return {api,location,status};
}
const target=section=>'http://demo.local/sidepanel.html?toolId=header-actions-demo&view=settings&section='+section;

test('blocked preview popup explicitly fails, retains the sidebar and never retries',async()=>{
  const opens=[];
  const p=await preview((...args)=>{opens.push(args);return null;});
  const before=p.location.href;
  await assert.rejects(p.api.tabs.create({url:target('preferences')}),/E_DEMO_POPUP_BLOCKED/);
  await flush();await flush();
  assert.equal(p.location.href,before);
  assert.deepEqual(p.location.assignments,[]);
  assert.deepEqual(opens,[['/?surface=page&view=settings&section=preferences','_blank']]);
});

test('successful preview popup returns a creation receipt for each allowed section without replacing the sidebar',async()=>{
  for(const section of ['preferences','about']){
    const opened={opener:{}};
    const p=await preview(()=>opened);
    assert.equal((await p.api.tabs.create({url:target(section)})).id,1);
    assert.equal(opened.opener,null);
    assert.deepEqual(p.location.assignments,[]);
  }
});

test('invalid preview targets fail before any popup or navigation',async()=>{
  let opens=0;
  const p=await preview(()=>{opens++;return {};});
  for(const url of [target('other'),target('about')+'&url=https://evil.test',target('about').replace('demo.local','evil.test')])
    await assert.rejects(p.api.tabs.create({url}),/E_DEMO_PAGE_TARGET/);
  assert.equal(opens,0);
  assert.deepEqual(p.location.assignments,[]);
});
