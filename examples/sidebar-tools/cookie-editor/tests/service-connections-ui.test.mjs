import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {createCookieServiceConnections} from '../trusted/service-connections.js';
import {presentCookieServiceState} from '../trusted/service-view.js';
import {serviceDescriptor} from '../../../../src/native-agent/managed-service-protocol.js';

// The existing JSX harness extended with state/effect scheduling and host refs.
// No SDK, browser, persistence or remote service is substituted into the component.
let active;
const React={
  createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),
  useState(initial){const h=active,i=h.index++;if(!(i in h.slots))h.slots[i]=typeof initial==='function'?initial():initial;
    return [h.slots[i],value=>{h.slots[i]=typeof value==='function'?value(h.slots[i]):value;h.changed=true;}];},
  useRef(initial){const h=active,i=h.index++;return h.slots[i]??= {current:initial};},
  useEffect(fn,deps){const h=active,i=h.index++,old=h.slots[i];
    if(!old||deps?.some((d,j)=>!Object.is(d,old.deps?.[j]))){h.effects.push(()=>{old?.cleanup?.();h.slots[i]={deps,cleanup:fn()};});}},
  useLayoutEffect(fn,deps){React.useEffect(fn,deps);}
};
const built=buildSync({entryPoints:[new URL('../app/components/CookieServiceConnections.jsx',import.meta.url).pathname],
  bundle:true,write:false,format:'cjs',platform:'node',external:['react'],jsx:'transform'});
const module={exports:{}};
new Function('require','module','exports',built.outputFiles[0].text)(name=>{
  assert.equal(name,'react');return React;
},module,module.exports);
const {CookieServiceConnections}=module.exports;
const nodes=node=>!node||typeof node!=='object'?[]:[node,...node.children.flatMap(nodes)];
const text=node=>!node||typeof node!=='object'?String(node??''):node.children.map(text).join('');
const connection={id:'c1',label:'公司服务',mode:'company',origin:'https://company.example',epoch:1,status:'UNCONNECTED',reasonCode:''};
const account={origin:'https://chatgpt.com',alias:'acct_1',version:4,displayName:'同名账号'};
function mount(overrides={}){
  const h={slots:[],index:0,effects:[],changed:false,tree:null,focus:null,calls:[],dirty:[],
    props:{origin:'https://chatgpt.com',accounts:[account],accountReady:true,busy:false,
      state:{revision:7,connections:[connection],associations:[],capabilities:{connect:false,openManagement:false,policyAcceptance:false}},
      onAction:async(action,payload)=>{h.calls.push([action,payload]);return true;},
      onDirtyChange:value=>h.dirty.push(value),...overrides}};
  h.render=()=>{let rounds=0;do{h.changed=false;h.index=0;h.effects=[];active=h;
    h.tree=CookieServiceConnections(h.props);
    for(const n of nodes(h.tree))if(n.props.ref)n.props.ref.current={isConnected:true,focus:()=>{h.focus=n.props['aria-label']||text(n);}};
    for(const effect of h.effects)effect();assert.ok(++rounds<20,'stable effects');
  }while(h.changed);return h.tree;};
  h.find=predicate=>nodes(h.tree).find(predicate);
  h.button=label=>{const n=h.find(n=>n.type==='button'&&(n.props['aria-label']||text(n))===label);assert.ok(n,'button '+label);return n;};
  h.click=label=>{const n=h.button(label);assert.ok(!n.props.disabled,label+' enabled');const result=n.props.onClick?.({currentTarget:{isConnected:true,focus:()=>{h.focus=label;}}});h.render();return result;};
  h.change=(label,value)=>{const n=h.find(n=>n.props['aria-label']===label);assert.ok(n,'field '+label);n.props.onChange({target:{value}});h.render();};
  h.submit=async()=>{const n=h.find(n=>n.type==='form');assert.ok(n);await n.props.onSubmit({preventDefault(){}});h.render();};
  h.update=patch=>{Object.assign(h.props,patch);h.render();};
  h.render();return h;
}
function startConfig(h){h.click('添加服务');h.change('服务名称','测试服务');}
function startAssociation(h){h.click('账号关联：公司服务');h.change('本站点账号','acct_1');
  h.change('组织','org-42');h.change('服务提供方','codex');h.change('远端资源 ID','resource-9');}

test('unavailable production capabilities disclose real states and terminal entry, with inert management',()=>{
  const h=mount({state:{revision:7,connections:[connection,{...connection,id:'c2',label:'断开服务',status:'DISCONNECTED'},
    {...connection,id:'c3',label:'过期服务',status:'INVALIDATED',reasonCode:'E_REVOKED'}],associations:[]}});
  assert.match(text(h.tree),/服务连接/);assert.match(text(h.tree),/未连接/);assert.match(text(h.tree),/已断开/);assert.match(text(h.tree),/已失效/);
  assert.match(text(h.tree),/npm start --prefix examples\/sidebar-tools\/cookie-editor\/ai-account-usage/);
  for(const n of nodes(h.tree).filter(n=>n.type==='button'&&text(n)==='管理页')){assert.equal(n.props.disabled,true);assert.equal(n.props.onClick,undefined);}
  assert.deepEqual(h.calls,[]);
});
test('local configuration saves an empty origin and only confirmed success clears dirty form',async()=>{
  const h=mount();startConfig(h);assert.equal(h.dirty.at(-1),true);await h.submit();
  assert.deepEqual(h.calls,[['serviceSave',{revision:7,label:'测试服务',mode:'local',serviceOrigin:''}]]);
  assert.equal(h.find(n=>n.type==='form'),undefined);assert.equal(h.dirty.at(-1),false);
});
test('company configuration rejects URL paths, credentials, query, fragments and non-HTTPS',async()=>{
  const h=mount();startConfig(h);h.change('服务类型','company');
  for(const value of ['http://company.example','https://company.example/','https://company.example/path',
    'https://u:p@company.example','https://company.example?x=1','https://company.example#x']){
    h.change('服务地址',value);await h.submit();assert.equal(h.calls.length,0);assert.ok(h.find(n=>n.props.role==='alert'));
  }
  h.change('服务地址','https://company.example:8443');await h.submit();
  assert.equal(h.calls[0][1].serviceOrigin,'https://company.example:8443');
});
test('failed save and unrelated state refresh preserve draft and error; Escape restores trigger focus',async()=>{
  const h=mount({onAction:async()=>false});h.click('添加服务');h.change('服务名称','修改草稿');await h.submit();
  h.update({state:{...h.props.state,revision:8}});
  assert.equal(h.find(n=>n.props['aria-label']==='服务名称').props.value,'修改草稿');assert.ok(h.find(n=>n.props.role==='alert'));
  h.find(n=>n.type==='form').props.onKeyDown({key:'Escape',preventDefault(){}});h.render();
  assert.equal(h.find(n=>n.type==='form'),undefined);assert.equal(h.focus,'添加服务');assert.equal(h.dirty.at(-1),false);
});
test('association requires explicit account choice, displays confirmation and sends alias/version rather than name',async()=>{
  const h=mount({accounts:[account,{...account,alias:'acct_2'},{...account,origin:'https://other.example',alias:'foreign'}]});
  h.click('账号关联：公司服务');assert.equal(h.find(n=>n.props['aria-label']==='本站点账号').props.value,'');
  assert.equal(nodes(h.tree).some(n=>n.type==='option'&&n.props.value==='foreign'),false);
  h.change('本站点账号','acct_2');h.change('组织','org-42');h.change('服务提供方','codex');h.change('远端资源 ID','resource-9');await h.submit();
  assert.deepEqual(h.calls,[]);const summary=text(h.tree);
  for(const value of ['https://chatgpt.com','acct_2','org-42','resource-9','codex','未核验','https://company.example'])assert.ok(summary.includes(value),value);
  await h.click('保存待连接关联');h.render();
  assert.deepEqual(h.calls,[['serviceAssociate',{revision:7,connectionId:'c1',alias:'acct_2',accountVersion:4,remoteAccountId:'resource-9',organization:'org-42',providerKey:'codex'}]]);
});
test('account version, readiness, site and service epoch changes invalidate confirmation without writing',async()=>{
  for(const patch of [{accounts:[{...account,version:5}]},{accountReady:false},{origin:'https://other.example'},
    {state:{revision:8,connections:[{...connection,epoch:2}],associations:[]}}]){
    const h=mount();startAssociation(h);await h.submit();const stale=h.button('保存待连接关联');h.update(patch);
    await stale.props.onClick();h.render();assert.deepEqual(h.calls,[]);assert.ok(h.find(n=>n.props.role==='alert'));
  }
});
test('no saved accounts offers original account recovery without fabricating choices',()=>{
  let recovered=0;const h=mount({accounts:[],onAccounts:()=>{recovered++;}});h.click('账号关联：公司服务');
  h.click('前往账号保存');assert.equal(recovered,1);assert.equal(h.calls.length,0);
});
test('pending save locks duplicate submissions synchronously and rejection preserves draft',async()=>{
  let reject;let calls=0;const h=mount({onAction:()=>{calls++;return new Promise((_resolve,no)=>{reject=no;});}});startConfig(h);
  const submit=h.find(n=>n.type==='form').props.onSubmit;
  const first=submit({preventDefault(){}});const second=submit({preventDefault(){}});h.render();
  assert.equal(calls,1);assert.equal(h.button('取消').props.disabled,true);reject(Error('secret backend detail'));await Promise.all([first,second]);h.render();
  assert.equal(h.find(n=>n.props['aria-label']==='服务名称').props.value,'测试服务');assert.ok(h.find(n=>n.props.role==='alert'));
  assert.doesNotMatch(text(h.tree),/secret backend detail/);
});
test('disconnect and remove require confirmation and delegate exact revision/identity payloads',async()=>{
  const h=mount({state:{revision:7,connections:[connection],associations:[{id:'a1',connectionId:'c1',localAlias:'acct_1',localOrigin:account.origin,
    remoteAccountId:'resource-9',organization:'org-42',providerKey:'codex',verification:'UNVERIFIED',status:'STALE'}]}});
  assert.match(text(h.tree),/未核验/);assert.match(text(h.tree),/已过期/);
  h.click('断开服务：公司服务');assert.equal(h.calls.length,0);await h.click('确认断开');h.render();
  h.click('移除关联：acct_1');assert.equal(h.calls.length,1);await h.click('确认移除');h.render();
  assert.deepEqual(h.calls,[['serviceDisconnect',{revision:7,connectionId:'c1'}],['serviceRemoveAssociation',{revision:7,associationId:'a1'}]]);
});

test('missing state/action and external busy disable writes; empty label and incomplete association never dispatch',async()=>{
  for(const props of [{state:undefined},{onAction:undefined},{busy:true}]){
    const h=mount(props);assert.equal(h.button('添加服务').props.disabled,true);assert.deepEqual(h.calls,[]);
  }
  const h=mount();h.click('添加服务');await h.submit();assert.deepEqual(h.calls,[]);assert.ok(h.find(n=>n.props.role==='alert'));
  h.click('取消');h.click('账号关联：公司服务');await h.submit();assert.deepEqual(h.calls,[]);
  h.change('本站点账号','acct_1');await h.submit();assert.deepEqual(h.calls,[]);assert.ok(h.find(n=>n.props.role==='alert'));
});
test('failed association, disconnect and removal retain the review instead of displaying success',async()=>{
  for(const kind of ['associate','disconnect','remove']){
    const h=mount({onAction:async()=>false,state:{revision:7,connections:[connection],associations:[{
      id:'a1',connectionId:'c1',localAlias:'acct_1',localOrigin:account.origin,verification:'UNVERIFIED',status:'PENDING_CONNECTION'}]}});
    if(kind==='associate'){startAssociation(h);await h.submit();await h.click('保存待连接关联');}
    else if(kind==='disconnect'){h.click('断开服务：公司服务');await h.click('确认断开');}
    else{h.click('移除关联：acct_1');await h.click('确认移除');}
    h.render();assert.ok(h.find(n=>n.type==='form'));assert.ok(h.find(n=>n.props.role==='alert'));
    h.click('取消');assert.equal(h.find(n=>n.type==='form'),undefined);
  }
});
test('unknown outcome busy keeps status reread usable and preserves draft and external notice',async()=>{
  const h=mount();startConfig(h);h.update({busy:true,notice:'结果未知，请重新读取状态。'});
  assert.match(text(h.tree),/结果未知，请重新读取状态/);
  assert.equal(h.button('保存配置').props.disabled,true);
  await h.click('重新读取状态');h.render();
  assert.deepEqual(h.calls,[['serviceStatus',{}]]);
  assert.equal(h.find(n=>n.props['aria-label']==='服务名称').props.value,'测试服务');
  assert.equal(h.dirty.at(-1),true);
});
test('site change clears alias, keeps nonsecret inputs, and allows explicit selection for the new site',async()=>{
  const h=mount();startAssociation(h);await h.submit();
  h.update({origin:'https://other.example',accounts:[{...account,origin:'https://other.example',alias:'new_alias'}]});
  assert.equal(h.find(n=>n.props['aria-label']==='本站点账号').props.value,'');
  assert.equal(h.find(n=>n.props['aria-label']==='组织').props.value,'org-42');
  assert.equal(h.find(n=>n.props['aria-label']==='远端资源 ID').props.value,'resource-9');
  await h.submit();assert.deepEqual(h.calls,[]);
  h.change('本站点账号','new_alias');await h.submit();await h.click('保存待连接关联');h.render();
  assert.equal(h.calls[0][1].alias,'new_alias');
});
test('unknown busy cannot discard drafts via Escape and failed reread is visible without a form',async()=>{
  const h=mount();startConfig(h);h.update({busy:true});
  h.find(n=>n.type==='form').props.onKeyDown({key:'Escape',preventDefault(){}});h.render();
  assert.ok(h.find(n=>n.type==='form'));assert.equal(h.dirty.at(-1),true);
  const readFailure=mount({onAction:async()=>{throw Error('do not expose');}});
  await readFailure.click('重新读取状态');readFailure.render();
  assert.ok(readFailure.find(n=>n.props.role==='alert'));assert.doesNotMatch(text(readFailure.tree),/do not expose/);
});
test('after service epoch refresh explicit account reselection can create a fresh confirmation',async()=>{
  const h=mount();startAssociation(h);await h.submit();
  h.update({state:{...h.props.state,revision:8,connections:[{...connection,epoch:2}]}});
  h.click('重新核对当前状态');h.change('本站点账号','acct_1');await h.submit();await h.click('保存待连接关联');h.render();
  assert.equal(h.calls[0][0],'serviceAssociate');assert.equal(h.calls[0][1].revision,8);
});
test('inline rename sends the existing connection identity and label only, then restores focus',async()=>{
  const h=mount();h.click('改名服务：公司服务');
  const card=h.find(n=>n.type==='article'&&n.props['aria-label']==='服务：公司服务');
  assert.ok(nodes(card).some(n=>n.type==='form'),'rename stays inside its connection row');
  assert.equal(h.find(n=>n.props['aria-label']==='新服务名称').props.value,'公司服务');
  assert.equal(h.dirty.at(-1),false);assert.equal(h.focus,'新服务名称');
  h.change('新服务名称','  财务服务  ');assert.equal(h.dirty.at(-1),true);
  await h.submit();
  assert.deepEqual(h.calls,[['serviceRename',{revision:7,connectionId:'c1',label:'财务服务'}]]);
  assert.equal(h.find(n=>n.type==='form'),undefined);assert.equal(h.dirty.at(-1),false);
  assert.equal(h.focus,'改名服务：公司服务');
  assert.equal(h.props.state.connections[0].id,'c1');assert.equal(h.props.state.connections[0].epoch,1);
});
test('failed rename preserves its draft across refresh and cancelling restores the rename trigger',async()=>{
  const h=mount({onAction:async()=>false});h.click('改名服务：公司服务');h.change('新服务名称','待保存名称');await h.submit();
  h.update({state:{...h.props.state,revision:8}});
  assert.equal(h.find(n=>n.props['aria-label']==='新服务名称').props.value,'待保存名称');
  assert.ok(h.find(n=>n.props.role==='alert'));assert.equal(h.dirty.at(-1),true);
  h.click('取消');assert.equal(h.find(n=>n.type==='form'),undefined);
  assert.equal(h.focus,'改名服务：公司服务');assert.equal(h.dirty.at(-1),false);
});
test('rename refuses blank or unchanged labels and busy unknown permits only status reread',async()=>{
  const h=mount();h.click('改名服务：公司服务');await h.submit();assert.deepEqual(h.calls,[]);
  h.change('新服务名称','  ');await h.submit();assert.deepEqual(h.calls,[]);assert.ok(h.find(n=>n.props.role==='alert'));
  h.change('新服务名称','新名称');h.update({busy:true});
  assert.equal(h.button('保存名称').props.disabled,true);await h.submit();assert.deepEqual(h.calls,[]);
  h.find(n=>n.type==='form').props.onKeyDown({key:'Escape',preventDefault(){}});h.render();
  assert.ok(h.find(n=>n.type==='form'));await h.click('重新读取状态');h.render();
  assert.deepEqual(h.calls,[['serviceStatus',{}]]);assert.equal(h.dirty.at(-1),true);
});

test('revision changes block config, rename, association and disconnect writes until explicit review',async()=>{
  for(const kind of ['config','rename','associate','disconnect']){
    const h=mount();
    if(kind==='config')startConfig(h);
    else if(kind==='rename'){h.click('改名服务：公司服务');h.change('新服务名称','新名称');}
    else if(kind==='associate'){startAssociation(h);await h.submit();}
    else h.click('断开服务：公司服务');
    h.update({state:{...h.props.state,revision:8}});
    if(kind==='associate')await h.click('保存待连接关联');
    else if(kind==='disconnect')await h.click('确认断开');
    else await h.submit();
    h.render();assert.deepEqual(h.calls,[]);assert.match(text(h.find(n=>n.props.role==='alert')),/重新核对/);
    h.click('重新核对当前状态');
    if(kind==='associate'){h.change('本站点账号','acct_1');await h.submit();await h.click('保存待连接关联');}
    else if(kind==='disconnect')await h.click('确认断开');
    else await h.submit();
    h.render();assert.equal(h.calls.length,1);assert.equal(h.calls[0][1].revision,8);
  }
});
test('association review cannot silently adopt a newer revision before confirmation, and recovered busy can cancel',async()=>{
  const h=mount();startAssociation(h);h.update({state:{...h.props.state,revision:8}});
  await h.submit();assert.deepEqual(h.calls,[]);
  assert.equal(h.find(n=>n.props['aria-label']==='待连接关联确认'),undefined);
  assert.match(text(h.tree),/重新核对/);
  h.update({busy:true});assert.equal(h.button('取消').props.disabled,true);
  await h.click('重新读取状态');h.render();assert.equal(h.dirty.at(-1),true);
  h.update({busy:false});h.click('取消');assert.equal(h.find(n=>n.type==='form'),undefined);
  assert.equal(h.dirty.at(-1),false);assert.equal(h.focus,'账号关联：公司服务');
  assert.deepEqual(h.calls,[['serviceStatus',{}]]);
});

const nativeService={serviceId:'ai-account-usage',serviceInstanceId:'instance-1',providerEpoch:'provider_epoch-3',
  productName:'AI Account Usage',origin:'http://ai-account-usage.localhost:43123',capabilities:['connect','open']};
const resource={remoteAccountId:'remote-1',providerKey:'codex',verificationState:'UNVERIFIED'};
const nativeConnection={...connection,label:'本机服务',mode:'local',origin:nativeService.origin,
  canConnect:true,canOpenManagement:true,status:'CONNECTED',resources:[resource],pending:null};
const bound={id:'a1',connectionId:'c1',localAlias:account.alias,localOrigin:account.origin,accountVersion:4,
  remoteAccountId:'remote-1',providerKey:'codex',organization:'本机用户',status:'BOUND',remoteRevocation:'REQUIRED',remoteBindingId:'binding-1',verification:'UNVERIFIED'};
const desired={desiredRevision:2,desiredHash:'a'.repeat(64),scope:{bindingIds:['binding-1'],
  dataCategories:['ACCOUNT_METADATA','USAGE_SUMMARY'],trigger:'MANUAL',retentionDays:30}};
function nativeMount(conn={},extra={}){return mount({state:{revision:7,sessionRevision:11,nativeServices:[nativeService],
  connections:[{...nativeConnection,...conn}],associations:[],...extra}});}

test('Native connect selects an actually registered process and requires explicit confirmation',async()=>{
  const h=nativeMount({status:'UNCONNECTED'});h.click('连接服务：本机服务');
  assert.equal(h.calls.length,0);assert.match(text(h.tree),/不会上传 Cookie/);
  assert.match(text(h.tree),/AI Account Usage/);assert.match(text(h.tree),/ai-account-usage/);
  await h.click('确认连接');h.render();assert.equal(h.calls.length,0,'no implicit service selection');
  h.change('已注册本机服务','instance-1');await h.click('确认连接');h.render();
  assert.deepEqual(h.calls,[['serviceConnect',{revision:7,sessionRevision:11,connectionId:'c1',serviceId:'ai-account-usage',providerEpoch:'provider_epoch-3'}]]);
  const unavailable=nativeMount({status:'UNCONNECTED'},{nativeServices:[]});
  assert.equal(unavailable.button('连接服务：本机服务').props.disabled,true);
});
test('Native connect refuses stale registration and never adopts a refreshed revision automatically',async()=>{
  const h=nativeMount({status:'UNCONNECTED'});h.click('连接服务：本机服务');h.change('已注册本机服务','instance-1');
  const confirm=h.button('确认连接');h.update({state:{...h.props.state,revision:8,nativeServices:[{...nativeService,providerEpoch:'provider_epoch-4'}]}});
  await confirm.props.onClick();h.render();assert.deepEqual(h.calls,[]);
  h.click('重新核对当前状态');assert.equal(h.find(n=>n.props['aria-label']==='已注册本机服务').props.value,'');
});
test('connected resource reads preserve draft; real resources use fixed codex and local version guards',async()=>{
  const h=nativeMount();h.click('账号关联：本机服务');h.change('本站点账号','acct_1');
  await h.click('读取远端资源：本机服务');h.render();assert.ok(h.find(n=>n.type==='form'));
  assert.equal(h.find(n=>n.props['aria-label']==='本站点账号').props.value,'acct_1');
  assert.equal(h.find(n=>n.type==='input'&&n.props['aria-label']==='远端资源 ID'),undefined);
  h.change('远端资源','remote-1');await h.submit();await h.click('保存待连接关联');h.render();
  assert.deepEqual(h.calls,[['serviceResources',{connectionId:'c1'}],['serviceAssociate',{revision:7,connectionId:'c1',alias:'acct_1',accountVersion:4,remoteAccountId:'remote-1',organization:'本机用户',providerKey:'codex'}]]);
  const stale=nativeMount();stale.click('账号关联：本机服务');stale.change('本站点账号','acct_1');stale.change('远端资源','remote-1');await stale.submit();
  const save=stale.button('保存待连接关联');stale.update({accounts:[{...account,version:5}]});await save.props.onClick();assert.deepEqual(stale.calls,[]);
});
test('management opens through direct commands for device and bound resource without links',async()=>{
  const h=nativeMount({}, {associations:[bound]});await h.click('管理页');h.render();await h.click('资源管理页：acct_1');h.render();
  assert.deepEqual(h.calls,[['serviceOpenManagement',{revision:7,sessionRevision:11,connectionId:'c1',associationId:''}],
    ['serviceOpenManagement',{revision:7,sessionRevision:11,connectionId:'c1',associationId:'a1'}]]);
  assert.equal(nodes(h.tree).some(n=>n.type==='a'||n.props.href),false);
});
test('pending unknown permits bounded reads and only open has explicit history-preserving archive',async()=>{
  for(const action of ['open','bind','connect']){
    const h=nativeMount({status:'OUTCOME_UNKNOWN',pending:{operationId:'op-1',action,outcome:'UNKNOWN'}});
    assert.equal(h.button('账号关联：本机服务').props.disabled,true);
    assert.equal(h.button('改名服务：本机服务').props.disabled,true);
    await h.click('核对原操作：本机服务');h.render();
    assert.deepEqual(h.calls,[['serviceReconcile',{connectionId:'c1'}]]);
    if(action==='open'){h.click('归档未知打开：本机服务');assert.match(text(h.tree),/保留历史/);
      await h.click('确认归档未知打开');h.render();assert.deepEqual(h.calls.at(-1),['serviceArchiveOpenUnknown',{revision:7,sessionRevision:11,connectionId:'c1',operationId:'op-1'}]);}
    else assert.equal(h.find(n=>n.type==='button'&&text(n)==='归档未知打开'),undefined);
  }
});
test('remote binding and unbinding are explicit; bound rows cannot be locally removed',async()=>{
  const h=nativeMount({}, {associations:[{...bound,status:'PENDING_CONNECTION',remoteBindingId:undefined}]});
  h.click('提交远端关联：acct_1');assert.equal(h.calls.length,0);await h.click('确认远端关联');h.render();
  assert.deepEqual(h.calls,[['serviceCommitAssociation',{revision:7,sessionRevision:11,associationId:'a1'}]]);
  h.update({state:{...h.props.state,associations:[bound]}});
  assert.equal(h.find(n=>n.type==='button'&&n.props['aria-label']==='移除关联：acct_1'),undefined);
  h.click('解绑关联：acct_1');await h.click('确认解绑');h.render();
  assert.deepEqual(h.calls.at(-1),['serviceUnbindAssociation',{revision:7,sessionRevision:11,associationId:'a1'}]);
  h.click('断开服务：本机服务');await h.click('确认断开');h.render();
  assert.deepEqual(h.calls.at(-1),['serviceRemoteDisconnect',{revision:7,sessionRevision:11,connectionId:'c1'}]);
});
test('policy requires explicit bounded scope review, keeps acceptance separate, sends exact desired identity',async()=>{
  const h=nativeMount({policy:{desired,acceptance:null,status:'PENDING',authEpoch:1,paused:false}},{associations:[bound]});
  assert.match(text(h.tree),/尚未接受/);await h.click('读取策略：本机服务');h.render();
  h.click('审阅策略：本机服务');await h.click('确认接受策略');h.render();assert.equal(h.calls.length,1);
  h.change('批准数据：ACCOUNT_METADATA',true);h.change('批准资源：binding-1',true);h.change('保留天数','31');
  await h.click('确认接受策略');h.render();assert.equal(h.calls.length,1);
  h.change('保留天数','7');await h.click('确认接受策略');h.render();
  assert.deepEqual(h.calls.at(-1),['serviceAcceptPolicy',{revision:7,sessionRevision:11,connectionId:'c1',desiredRevision:2,desiredHash:desired.desiredHash,
    scope:{bindingIds:['binding-1'],dataCategories:['ACCOUNT_METADATA'],trigger:'MANUAL',retentionDays:7}}]);
});
test('stale policy desired/auth epoch and unknown arriving during a form block captured confirmation',async()=>{
  for(const patch of [{policy:{desired:{...desired,desiredHash:'b'.repeat(64)},authEpoch:1}},
    {policy:{desired,authEpoch:2}},{pending:{operationId:'p',action:'accept',outcome:'UNKNOWN'}}]){
    const h=nativeMount({policy:{desired,authEpoch:1}},{associations:[bound]});h.click('审阅策略：本机服务');
    h.change('批准数据：ACCOUNT_METADATA',true);h.change('批准资源：binding-1',true);
    const accept=h.button('确认接受策略');h.update({state:{...h.props.state,connections:[{...h.props.state.connections[0],...patch}]}});
    await accept.props.onClick();h.render();assert.deepEqual(h.calls,[]);assert.ok(h.find(n=>n.type==='form'));
  }
});

test('Native revision fences cover policy, commit, unbind, remote disconnect and unknown-open archive',async()=>{
  for(const kind of ['policy','commit','unbind','disconnect','archive']){
    const h=nativeMount({policy:{desired,authEpoch:1},...(kind==='archive'?{pending:{operationId:'p',action:'open',outcome:'UNKNOWN'}}:{})},
      {associations:[{...bound,...(kind==='commit'?{status:'PENDING_CONNECTION',remoteBindingId:undefined}:{})}]});
    const actions={policy:['审阅策略：本机服务','确认接受策略'],commit:['提交远端关联：acct_1','确认远端关联'],
      unbind:['解绑关联：acct_1','确认解绑'],disconnect:['断开服务：本机服务','确认断开'],archive:['归档未知打开：本机服务','确认归档未知打开']};
    h.click(actions[kind][0]);
    if(kind==='policy'){h.change('批准数据：ACCOUNT_METADATA',true);h.change('批准资源：binding-1',true);}
    const confirm=h.button(actions[kind][1]);h.update({state:{...h.props.state,revision:8}});
    await confirm.props.onClick();h.render();assert.deepEqual(h.calls,[],kind);assert.ok(h.find(n=>n.type==='form'));
    h.click('重新核对当前状态');
    if(kind==='policy'){
      assert.equal(h.find(n=>n.props['aria-label']==='批准数据：ACCOUNT_METADATA').props.checked,false);
      h.change('批准数据：ACCOUNT_METADATA',true);h.change('批准资源：binding-1',true);
    }
    await h.click(actions[kind][1]);h.render();assert.equal(h.calls.length,1,kind);assert.equal(h.calls[0][1].revision,8);
  }
});
test('read-only refresh preserves entered policy scope and old revision; failures show no backend secrets',async()=>{
  const h=nativeMount({policy:{desired,authEpoch:1}},{associations:[bound]});h.click('审阅策略：本机服务');
  h.change('批准数据：ACCOUNT_METADATA',true);h.change('批准资源：binding-1',true);h.change('保留天数','5');
  h.update({onAction:async(action,payload)=>{h.calls.push([action,payload]);h.update({state:{...h.props.state,revision:8}});return true;}});
  await h.click('读取策略：本机服务');h.render();
  assert.equal(h.find(n=>n.props['aria-label']==='保留天数').props.value,'5');assert.equal(h.dirty.at(-1),true);
  await h.click('确认接受策略');h.render();assert.deepEqual(h.calls,[['serviceReadPolicy',{connectionId:'c1'}]]);
  h.update({onAction:async()=>{throw Error('https://private.example/?token=secret');}});
  await h.click('读取策略：本机服务');h.render();assert.ok(h.find(n=>n.props.role==='alert'));
  assert.doesNotMatch(text(h.tree),/private.example|token=secret/);
});
test('unregistered, company and credential-bearing Native descriptors cannot be selected or rendered',()=>{
  const h=nativeMount({status:'UNCONNECTED'},{nativeServices:[nativeService,
    {...nativeService,serviceInstanceId:'evil',serviceId:'company',origin:'https://company.example/?secret=1'},
    {...nativeService,serviceInstanceId:'credentials',origin:'http://u:p@localhost:4321'},
    {...nativeService,serviceInstanceId:'path',origin:'http://localhost:4321/?token=secret'}]});
  h.click('连接服务：本机服务');const select=h.find(n=>n.props['aria-label']==='已注册本机服务');
  assert.deepEqual(nodes(select).filter(n=>n.type==='option').map(n=>n.props.value),['','instance-1']);
  assert.doesNotMatch(text(h.tree),/secret=1|u:p|token=secret/);
});
test('stale commit cannot bind a changed local account, origin or removed resource',async()=>{
  for(const patch of [{accounts:[{...account,version:5}]},{origin:'https://other.example'},
    {accountReady:false},{state:{revision:7,sessionRevision:11,nativeServices:[nativeService],connections:[{...nativeConnection,resources:[]}],
      associations:[{...bound,status:'PENDING_CONNECTION',remoteBindingId:undefined}]}}]){
    const h=nativeMount({}, {associations:[{...bound,status:'PENDING_CONNECTION',remoteBindingId:undefined}]});
    h.click('提交远端关联：acct_1');const confirm=h.button('确认远端关联');h.update(patch);
    await confirm.props.onClick();h.render();assert.deepEqual(h.calls,[]);assert.ok(h.find(n=>n.props.role==='alert'));
  }
});
test('captured local remove cannot bypass newly bound remote state; stale unknown archive cannot target another operation',async()=>{
  const h=nativeMount({}, {associations:[{...bound,status:'PENDING_CONNECTION',remoteBindingId:undefined}]});
  h.click('移除关联：acct_1');const remove=h.button('确认移除');h.update({state:{...h.props.state,associations:[bound]}});
  await remove.props.onClick();h.render();assert.deepEqual(h.calls,[]);
  const u=nativeMount({pending:{operationId:'old',action:'open',outcome:'UNKNOWN'}});u.click('归档未知打开：本机服务');
  const archive=u.button('确认归档未知打开');u.update({state:{...u.props.state,connections:[{...nativeConnection,pending:{operationId:'new',action:'accept',outcome:'UNKNOWN'}}]}});
  await archive.props.onClick();u.render();assert.deepEqual(u.calls,[]);
});


test('registered descriptors match actual Native protocol IDs and exact single-label localhost origins',async()=>{
  const cases=[nativeService,{...nativeService,providerEpoch:'Epoch_4-valid',origin:'http://a.localhost:1'},
    ...[3,'','bad epoch','a'.repeat(97)].map(providerEpoch=>({...nativeService,providerEpoch})),
    ...['http://127.0.0.1:43123','http://localhost:43123','http://a.b.localhost:43123',
      'https://a.localhost:43123','http://a.localhost:0','http://a.localhost',
      'http://a.localhost:80','http://a.localhost:43123/','http://u:p@a.localhost:43123',
      'http://a.localhost:43123/?token=secret'].map(origin=>({...nativeService,origin}))];
  for(const descriptor of cases){
    const valid=serviceDescriptor(descriptor,{registered:true});
    const h=nativeMount({status:'UNCONNECTED'},{nativeServices:[descriptor]});
    assert.equal(h.button('连接服务：本机服务').props.disabled,!valid,JSON.stringify(descriptor));
    if(valid){h.click('连接服务：本机服务');h.change('已注册本机服务',descriptor.serviceInstanceId);
      await h.click('确认连接');h.render();
      assert.deepEqual(h.calls,[['serviceConnect',{revision:7,sessionRevision:11,connectionId:'c1',serviceId:descriptor.serviceId,providerEpoch:descriptor.providerEpoch}]]);}
  }
  assert.equal(serviceDescriptor(nativeService,{registered:true}),true,'fixture is a real protocol descriptor');
});
test('minimal remote resource DTO has an identifiable selectable label without displayName',()=>{
  assert.equal(Object.hasOwn(resource,'displayName'),false);
  const h=nativeMount();h.click('账号关联：本机服务');
  const option=h.find(n=>n.type==='option'&&n.props.value===resource.remoteAccountId);
  assert.equal(text(option),'remote-1 · 未核验');
});
test('archive confirmation bypasses blocked form submit only through an enabled explicit button while unknown',async()=>{
  const h=nativeMount({status:'OUTCOME_UNKNOWN',pending:{operationId:'open-unknown',action:'open',outcome:'UNKNOWN'}});
  h.click('归档未知打开：本机服务');
  const confirm=h.button('确认归档未知打开');
  assert.equal(confirm.props.type,'button');assert.equal(confirm.props.disabled,false);
  assert.equal(h.props.state.connections[0].status,'OUTCOME_UNKNOWN');
  assert.equal(h.button('添加服务').props.disabled,true);
  await h.submit();assert.deepEqual(h.calls,[],'form submit cannot perform an implicit archive');
  await h.click('确认归档未知打开');h.render();
  assert.deepEqual(h.calls,[['serviceArchiveOpenUnknown',{revision:7,sessionRevision:11,connectionId:'c1',operationId:'open-unknown'}]]);
  assert.equal(h.props.state.connections[0].pending.operationId,'open-unknown','UI does not rewrite outcome history');
});


test('Native local draft visibly reviews a local organization label and passes the actual metadata engine',async()=>{
  const records=new Map();
  const storage=async()=>({transaction:async(_tables,mode,work)=>{
    const copy=structuredClone(records);
    const result=await work({get:async(_table,key)=>structuredClone(copy.get(key)),
      put:async(_table,value,key)=>copy.set(key,structuredClone(value))});
    if(mode==='readwrite'){records.clear();for(const [key,value] of copy)records.set(key,value);}
    return result;
  }});
  const engine=createCookieServiceConnections({storage});
  const identity={packageHash:'a'.repeat(64),installEpoch:'install-1'};
  const dispatch=async(operation,payload)=>presentCookieServiceState(await engine.dispatch({operation,payload:{origin:account.origin,...payload},identity,accounts:[account]}));
  const saved=await dispatch('serviceSave',{revision:0,label:'本机服务',mode:'local',serviceOrigin:''});
  const connectionId=saved.connections[0].id;
  const required={revision:saved.revision,connectionId,alias:account.alias,accountVersion:account.version,
    remoteAccountId:resource.remoteAccountId,providerKey:'codex',organization:''};
  await assert.rejects(dispatch('serviceAssociate',required),{code:'E_SERVICE_INPUT'},'real engine requires organization');
  let accepted;
  const h=mount({state:{...saved,nativeServices:[nativeService],connections:[{...saved.connections[0],...nativeConnection,id:connectionId}]},
    onAction:async(action,payload)=>{h.calls.push([action,payload]);accepted=await dispatch(action,payload);return true;}});
  h.click('账号关联：本机服务');assert.match(text(h.tree),/组织：本机用户/);
  assert.match(text(h.tree),/本地分类标签/);assert.match(text(h.tree),/不代表服务端公司组织/);
  h.change('本站点账号',account.alias);h.change('远端资源',resource.remoteAccountId);await h.submit();
  const review=h.find(n=>n.props['aria-label']==='待连接关联确认');assert.match(text(review),/组织：本机用户/);
  await h.click('保存待连接关联');h.render();
  assert.deepEqual(h.calls,[['serviceAssociate',{...required,organization:'本机用户'}]]);
  assert.equal(accepted.associations[0].organization,'本机用户');
  assert.equal(accepted.associations[0].verification,'UNVERIFIED');
  assert.equal(accepted.associations[0].accountVersion,account.version);
  assert.equal(h.find(n=>n.type==='form'),undefined);
});


test('reconnected Native generation invalidates every old confirmation until explicit fresh review',async()=>{
  const actions={connect:['连接服务：本机服务','确认连接'],policy:['审阅策略：本机服务','确认接受策略'],
    commit:['提交远端关联：acct_1','确认远端关联'],unbind:['解绑关联：acct_1','确认解绑'],
    disconnect:['断开服务：本机服务','确认断开'],archive:['归档未知打开：本机服务','确认归档未知打开']};
  for(const kind of Object.keys(actions)){
    const h=nativeMount({policy:{desired,authEpoch:1},...(kind==='connect'?{status:'UNCONNECTED'}:{}),
      ...(kind==='archive'?{status:'OUTCOME_UNKNOWN',pending:{operationId:'p',action:'open',outcome:'UNKNOWN'}}:{})},
      {associations:[{...bound,...(kind==='commit'?{status:'PENDING_CONNECTION',remoteBindingId:undefined}:{})}]});
    h.click(actions[kind][0]);
    if(kind==='connect')h.change('已注册本机服务','instance-1');
    if(kind==='policy'){h.change('批准数据：ACCOUNT_METADATA',true);h.change('批准资源：binding-1',true);h.change('保留天数','5');}
    const old=h.button(actions[kind][1]);
    h.update({state:{...h.props.state,sessionRevision:12}});
    assert.equal(h.props.state.revision,7);assert.equal(h.props.state.connections[0].epoch,nativeConnection.epoch);
    await old.props.onClick();h.render();assert.deepEqual(h.calls,[],kind);
    assert.equal(h.dirty.at(-1),true);assert.ok(h.find(n=>n.type==='form'));
    if(kind==='policy')assert.equal(h.find(n=>n.props['aria-label']==='保留天数').props.value,'5');
    h.click('重新核对当前状态');
    if(kind==='connect')h.change('已注册本机服务','instance-1');
    if(kind==='policy'){h.change('批准数据：ACCOUNT_METADATA',true);h.change('批准资源：binding-1',true);}
    await old.props.onClick();h.render();assert.deepEqual(h.calls,[],'captured old handler remains stale');
    await h.click(actions[kind][1]);h.render();assert.equal(h.calls.length,1,kind);
    assert.equal(h.calls[0][1].sessionRevision,12);assert.equal(h.calls[0][1].revision,7);
  }
});
test('read refresh changes only Native generation, preserving policy draft and fencing confirmation',async()=>{
  const h=nativeMount({policy:{desired,authEpoch:1}},{associations:[bound]});h.click('审阅策略：本机服务');
  h.change('批准数据：ACCOUNT_METADATA',true);h.change('批准资源：binding-1',true);h.change('保留天数','5');
  h.update({onAction:async(action,payload)=>{h.calls.push([action,payload]);h.update({state:{...h.props.state,sessionRevision:12}});return true;}});
  await h.click('读取策略：本机服务');h.render();await h.click('确认接受策略');h.render();
  assert.deepEqual(h.calls,[['serviceReadPolicy',{connectionId:'c1'}]]);
  assert.equal(h.find(n=>n.props['aria-label']==='保留天数').props.value,'5');assert.equal(h.dirty.at(-1),true);
  assert.ok(h.button('重新核对当前状态'));
});
test('management new gesture uses current Native generation; local metadata has no Native field',async()=>{
  const h=nativeMount();h.update({state:{...h.props.state,sessionRevision:12}});await h.click('管理页');h.render();
  assert.equal(h.calls[0][1].sessionRevision,12);
  h.click('改名服务：本机服务');h.change('新服务名称','新名称');await h.submit();
  assert.deepEqual(h.calls[1],['serviceRename',{revision:7,connectionId:'c1',label:'新名称'}]);
});
test('stale active binding can unbind without a local account and confirmed revocation can be removed',async()=>{
  const h=nativeMount({}, {associations:[{...bound,status:'STALE'}]});h.update({accounts:[],accountReady:false});
  assert.equal(h.find(n=>n.props['aria-label']==='移除关联：acct_1'),undefined);
  assert.equal(h.find(n=>n.props['aria-label']==='资源管理页：acct_1'),undefined);
  h.click('解绑关联：acct_1');await h.click('确认解绑');h.render();
  assert.deepEqual(h.calls,[['serviceUnbindAssociation',{revision:7,sessionRevision:11,associationId:'a1'}]]);
  h.update({state:{...h.props.state,associations:[{...bound,status:'PENDING_CONNECTION',remoteRevocation:'CONFIRMED'}]}});
  assert.equal(h.find(n=>n.props['aria-label']==='提交远端关联：acct_1'),undefined);
  h.click('移除关联：acct_1');await h.click('确认移除');h.render();
  assert.deepEqual(h.calls.at(-1),['serviceRemoveAssociation',{revision:7,associationId:'a1'}]);
});
test('captured confirmed removal cannot erase a binding requiring remote revocation',async()=>{
  const h=nativeMount({}, {associations:[{...bound,status:'STALE',remoteRevocation:'CONFIRMED'}]});
  h.click('移除关联：acct_1');const remove=h.button('确认移除');
  h.update({state:{...h.props.state,associations:[{...bound,status:'STALE'}]}});
  await remove.props.onClick();h.render();assert.deepEqual(h.calls,[]);assert.ok(h.find(n=>n.props.role==='alert'));
});

test('Native writes refuse missing or unsafe session revisions even after explicit review',async()=>{
  for(const sessionRevision of [undefined,null,'11',1.5,Number.MAX_SAFE_INTEGER+1]){
    const h=nativeMount({status:'UNCONNECTED'},{sessionRevision});
    h.click('连接服务：本机服务');h.change('已注册本机服务','instance-1');
    await h.click('确认连接');h.render();assert.deepEqual(h.calls,[]);
    h.click('重新核对当前状态');h.change('已注册本机服务','instance-1');
    await h.click('确认连接');h.render();assert.deepEqual(h.calls,[]);
    const direct=nativeMount({}, {sessionRevision});await direct.click('管理页');direct.render();
    assert.deepEqual(direct.calls,[]);assert.ok(direct.find(n=>n.props.role==='alert'));
  }
});
