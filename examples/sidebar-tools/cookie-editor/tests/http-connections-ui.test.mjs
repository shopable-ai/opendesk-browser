import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';

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
const built=buildSync({entryPoints:[new URL('../app/components/CookieHttpConnections.jsx',import.meta.url).pathname],
  bundle:true,write:false,format:'cjs',platform:'node',external:['react'],jsx:'transform'});
const module={exports:{}};
new Function('require','module','exports',built.outputFiles[0].text)(name=>{
  assert.equal(name,'react');return React;
},module,module.exports);
const {CookieHttpConnections}=module.exports;
const nodes=node=>!node||typeof node!=='object'?[]:[node,...node.children.flatMap(nodes)];
const text=node=>!node||typeof node!=='object'?String(node??''):node.children.map(text).join('');
const resource={remoteAccountId:'r1',providerKey:'codex',displayName:'远端账号',verificationState:'UNVERIFIED'};
const account={origin:'https://chatgpt.com',alias:'acct_1',version:4,displayName:'本地账号',storeId:'0',partitionKey:null};
const binding={bindingId:'b1',localAccount:account,remoteAccountId:'r1',verificationState:'UNVERIFIED',revoked:false,revision:1,authEpoch:1};
const connection={id:'c1',label:'HTTP 服务',origin:'http://localhost:8787',status:'CONNECTED',resources:[resource],bindings:[binding],pending:null};
function mount(overrides={}){
  const h={slots:[],index:0,effects:[],changed:false,tree:null,focus:null,calls:[],dirty:[],
    props:{origin:'https://chatgpt.com',accounts:[account],accountReady:true,busy:false,
      state:{revision:7,connections:[connection]},
      onAction:async(action,payload)=>{h.calls.push([action,payload]);return true;},
      onDirtyChange:value=>h.dirty.push(value),...overrides}};
  h.render=()=>{let rounds=0;do{h.changed=false;h.index=0;h.effects=[];active=h;
    h.tree=CookieHttpConnections(h.props);
    for(const n of nodes(h.tree))if(n.props.ref)n.props.ref.current={isConnected:true,focus:()=>{h.focus=n.props['aria-label']||text(n);}};
    for(const effect of h.effects)effect();assert.ok(++rounds<20,'stable effects');
  }while(h.changed);return h.tree;};
  h.find=predicate=>nodes(h.tree).find(predicate);
  h.button=label=>{const n=h.find(n=>n.type==='button'&&(n.props['aria-label']||text(n))===label);assert.ok(n,'button '+label);return n;};
  h.click=label=>{const n=h.button(label);assert.ok(!n.props.disabled,label+' enabled');const result=n.props.onClick?.({preventDefault(){},currentTarget:{isConnected:true,focus:()=>{h.focus=label;}}});h.render();return result;};
  h.change=(label,value)=>{const n=h.find(n=>n.props['aria-label']===label);assert.ok(n,'field '+label);n.props.onChange({target:{value}});h.render();};
  h.submit=async()=>{const n=h.find(n=>n.type==='form');assert.ok(n);await n.props.onSubmit({preventDefault(){}});h.render();};
  h.update=patch=>{Object.assign(h.props,patch);h.render();};
  h.render();return h;
}
const invoke=async(h,label)=>{await h.click(label);h.render();};
const configure=h=>{h.click('添加服务');h.change('服务名称','测试 HTTP');};
const choose=h=>{h.click('绑定账号：HTTP 服务');h.change('本站点账号','acct_1');h.change('远端资源','r1');};

test('configuration accepts only exact HTTPS or HTTP loopback origins; sandbox uses explicit buttons',async()=>{
  const h=mount();configure(h);
  for(const value of ['http://remote.example','http://localhost:8787/','http://localhost:8787/path','http://localhost:8787?x=1',
    'http://localhost:8787#x','http://u:p@localhost:8787','http://127.0.0.1.evil:8787','http://127.1:8787','http://127.0.0.2:8787','http://127.10.0.1:8787',
    'http://usage-abc.localhost.evil:8787','http://usage-abc.localhost:8787/','https://service.example/']){
    h.change('服务地址',value);await invoke(h,'保存配置');assert.equal(h.calls.length,0,value);
  }
  for(const value of ['http://localhost:8787','http://usage-a1b2c3.localhost:8787','http://127.0.0.1:8787','http://[::1]:8787','https://service.example']){
    h.change('服务地址',value);await invoke(h,'保存配置');
    assert.deepEqual(h.calls.at(-1),['serviceSave',{revision:7,label:'测试 HTTP',serviceOrigin:value}]);
    assert.equal(h.dirty.at(-1),false);configure(h);
  }
  for(const node of nodes(h.tree).filter(n=>n.type==='button'))assert.equal(node.props.type,'button');
});
test('pairing code remains password-only and clears only on confirmed success; Enter and Escape work locally',async()=>{
  const h=mount({state:{revision:7,connections:[{...connection,status:'UNCONNECTED'}]}});
  h.click('连接服务：HTTP 服务');
  const field=()=>h.find(n=>n.props['aria-label']==='应用一次性配对码');
  assert.equal(field().props.type,'password');assert.equal(field().props.autoComplete,'off');
  h.change('应用一次性配对码','admin-link');await invoke(h,'确认连接');assert.deepEqual(h.calls,[]);
  const code='a'.repeat(64);h.change('应用一次性配对码',code.toUpperCase());assert.ok(!text(h.tree).includes(code));
  await h.find(n=>n.type==='form').props.onKeyDown({key:'Enter',target:{tagName:'INPUT'},preventDefault(){}});
  await Promise.resolve();h.render();
  assert.deepEqual(h.calls,[['serviceConnect',{revision:7,connectionId:'c1',code}]]);
  assert.equal(field(),undefined);assert.equal(h.focus,'连接服务：HTTP 服务');
  h.click('连接服务：HTTP 服务');h.change('应用一次性配对码',code);
  h.find(n=>n.type==='form').props.onKeyDown({key:'Escape',preventDefault(){}});h.render();
  assert.equal(field(),undefined);assert.equal(h.dirty.at(-1),false);
});
test('read resources, explicit bind review, exact device/resource open, unbind and disconnect payloads',async()=>{
  const h=mount();await invoke(h,'读取资源：HTTP 服务');
  choose(h);await invoke(h,'核对绑定');assert.equal(h.calls.length,1);
  assert.match(text(h.tree),/未核验（UNVERIFIED）/);await invoke(h,'确认绑定');
  await invoke(h,'打开设备管理页：HTTP 服务');await invoke(h,'打开资源管理页：b1');
  h.click('解绑账号：b1');assert.equal(h.calls.length,4);await invoke(h,'确认解绑');
  h.click('断开服务：HTTP 服务');assert.equal(h.calls.length,5);await invoke(h,'确认断开');
  assert.deepEqual(h.calls,[
    ['serviceResources',{revision:7,connectionId:'c1'}],
    ['serviceBind',{revision:7,connectionId:'c1',alias:'acct_1',accountVersion:4,remoteAccountId:'r1'}],
    ['serviceOpen',{revision:7,connectionId:'c1',bindingId:''}],
    ['serviceOpen',{revision:7,connectionId:'c1',bindingId:'b1'}],
    ['serviceUnbind',{revision:7,connectionId:'c1',bindingId:'b1'}],
    ['serviceDisconnect',{revision:7,connectionId:'c1'}]
  ]);
});
test('stale origin, account identity/version/readiness, revision and binding invalidate saved confirmation handlers',async()=>{
  for(const action of ['bind','unbind','disconnect'])for(const patch of [
    {origin:'https://other.example'}, {accounts:[{...account,version:5}]}, {accounts:[{...account,storeId:'1'}]},
    {accountReady:false}, {state:{revision:8,connections:[connection]}},
    {state:{revision:7,connections:[{...connection,bindings:[{...binding,authEpoch:2}]}]}}
  ]){
    const h=mount();
    if(action==='bind'){choose(h);await invoke(h,'核对绑定');}
    else h.click(action==='unbind'?'解绑账号：b1':'断开服务：HTTP 服务');
    const confirm=h.button({bind:'确认绑定',unbind:'确认解绑',disconnect:'确认断开'}[action]);
    h.update(patch);await confirm.props.onClick();h.render();assert.deepEqual(h.calls,[]);
    assert.match(text(h.tree),/已变化/);
  }
});
test('unknown freezes all services, allows receipts and cached usage, and archives open manually without replay',async()=>{
  const h=mount({state:{revision:7,connections:[{...connection,status:'OUTCOME_UNKNOWN',pending:{action:'serviceOpen',operationId:'op1',canArchive:true}},
    {...connection,id:'c2',label:'另一个服务',resources:[{...resource,remoteAccountId:'r2'}]}]}});
  assert.equal(h.button('添加服务').props.disabled,true);
  assert.equal(h.button('打开设备管理页：另一个服务').props.disabled,true);
  await invoke(h,'读取回执：HTTP 服务');await invoke(h,'读取缓存用量：r2');
  h.click('核对并归档未知打开');assert.equal(h.calls.length,2);await invoke(h,'确认归档');
  assert.deepEqual(h.calls.map(call=>call[0]),['serviceReconcile','serviceUsage','serviceArchiveOpen']);
  assert.match(text(h.tree),/所有服务写入已暂停/); // Parent still reports unknown.
});
test('false open outcome immediately blocks duplicate writes until receipt; never shows retry-open',async()=>{
  const h=mount({onAction:async(action,payload)=>{h.calls.push([action,payload]);return action==='serviceStatus';}});
  await invoke(h,'打开设备管理页：HTTP 服务');
  assert.equal(h.button('打开设备管理页：HTTP 服务').props.disabled,true);
  assert.ok(!text(h.tree).includes('重试'));assert.ok(!h.find(n=>n.type==='button'&&text(n)==='核对并归档未知打开'));
  await invoke(h,'读取回执：HTTP 服务');assert.equal(h.button('打开设备管理页：HTTP 服务').props.disabled,false);
});
test('failed configuration cannot manually unlock an unknown result; fresh authoritative revision releases it',async()=>{
  const h=mount({onAction:async()=>false});configure(h);h.change('服务地址','http://localhost:8787');
  await invoke(h,'保存配置');assert.equal(h.button('保存配置').props.disabled,true);
  assert.equal(h.find(n=>n.props['aria-label']==='服务地址').props.value,'http://localhost:8787');
  h.click('取消');assert.equal(h.button('添加服务').props.disabled,true);
  h.update({state:{revision:8,connections:[connection]}});assert.equal(h.button('添加服务').props.disabled,false);
});
test('in-flight double click is locked and rejected pairing keeps protected draft with a plain error',async()=>{
  let reject;const h=mount({state:{revision:7,connections:[{...connection,status:'UNCONNECTED'}]},
    onAction:(action,payload)=>{h.calls.push([action,payload]);return new Promise((_ok,no)=>{reject=no;});}});
  h.click('连接服务：HTTP 服务');h.change('应用一次性配对码','b'.repeat(64));
  const handler=h.button('确认连接').props.onClick;
  const first=handler();const second=handler();h.render();assert.equal(h.calls.length,1);assert.equal(h.button('取消').props.disabled,true);
  reject(Error('credential-secret'));await Promise.all([first,second]);h.render();
  assert.equal(h.find(n=>n.props['aria-label']==='应用一次性配对码').props.value,'b'.repeat(64));
  assert.doesNotMatch(text(h.tree),/credential-secret/);assert.equal(h.button('确认连接').props.disabled,true);
});
test('resource cache reads only exact selected resource and renders allowlisted window scalars without dumping account',async()=>{
  const h=mount({state:{revision:7,connections:[{...connection,usageCache:{r1:{status:'OK',observedAt:'2026-10-31T10:00:00Z',sourceMode:'cache',
    account:{credentials:'credential-secret',apiKey:'key-secret',windows:[{key:'primary',usedPercent:60,remainingPercent:40,
      resetsAt:'2026-11-01T10:00:00Z',secret:'window-secret'},{key:'credential-secret',usedPercent:'key-secret',remainingPercent:900}]}}}}]}});
  await invoke(h,'读取缓存用量：r1');
  assert.deepEqual(h.calls,[['serviceUsage',{revision:7,connectionId:'c1',remoteAccountId:'r1'}]]);
  assert.match(text(h.tree),/读取成功/);assert.match(text(h.tree),/已用 60%/);assert.match(text(h.tree),/剩余 40%/);
  assert.doesNotMatch(text(h.tree),/credential-secret|key-secret|window-secret|900%/);
});
test('missing state, empty accounts, loading, unavailable actions and session expiry remain explicit and inert',()=>{
  for(const props of [{state:undefined},{busy:true},{onAction:undefined}]){
    const h=mount(props);assert.equal(h.button('添加服务').props.disabled,true);assert.deepEqual(h.calls,[]);
  }
  let recovered=0;const h=mount({accounts:[],onAccounts:()=>recovered++});h.click('绑定账号：HTTP 服务');
  h.click('前往账号保存');assert.equal(recovered,1);assert.match(text(h.tree),/尚无已保存账号/);
  const expired=mount({state:{revision:7,connections:[{...connection,status:'SESSION_EXPIRED'}]}});
  assert.match(text(expired.tree),/会话已过期/);assert.equal(expired.button('打开设备管理页：HTTP 服务').props.disabled,true);
  assert.equal(expired.button('连接服务：HTTP 服务').props.disabled,true);
  const empty=mount({state:{revision:0,connections:[]}});assert.match(text(empty.tree),/尚未配置服务/);
});

test('controller root usageCache windows render without exposing other cached fields',()=>{
  const h=mount({state:{revision:7,connections:[{...connection,usageCache:{r1:{status:'OK',observedAt:'2026-10-31T10:00:00Z',sourceMode:'cache',
    windows:[{key:'primary',usedPercent:25,remainingPercent:75,resetsAt:'2026-11-01T10:00:00Z',credential:'root-secret'}],
    account:{apiKey:'account-secret',windows:[{key:'primary',usedPercent:99}]}}}}]}});
  assert.match(text(h.tree),/已用 25%/);assert.match(text(h.tree),/剩余 75%/);
  assert.doesNotMatch(text(h.tree),/root-secret|account-secret|99%/);
});

const desired={desiredRevision:3,desiredHash:'a'.repeat(64),scope:{bindingIds:['b1','b2'],
  dataCategories:['ACCOUNT_METADATA','USAGE_SUMMARY'],trigger:'MANUAL',retentionDays:14}};
const policyConnection={...connection,bindings:[binding,{...binding,bindingId:'b2',remoteAccountId:'r2'}],
  policy:{desired,acceptance:{desiredRevision:2,scope:{bindingIds:['b1'],dataCategories:['ACCOUNT_METADATA'],trigger:'MANUAL',retentionDays:7}}}};
function selectPolicy(h){
  h.click('审阅同步策略：HTTP 服务');
  for(const label of ['批准绑定：b1','批准数据：USAGE_SUMMARY']){
    h.find(n=>n.props['aria-label']===label).props.onChange({target:{checked:true}});h.render();
  }
  h.change('保留天数','5');
}
test('confirmed no-dispatch rejection keeps draft and permits explicit review without unknown latch',async()=>{
  const h=mount({state:{revision:7,connections:[{...connection,status:'UNCONNECTED'}]},notice:'父级拒绝提示',
    onAction:async(action,payload)=>{h.calls.push([action,payload]);return {rejected:true};}});
  h.click('连接服务：HTTP 服务');h.change('应用一次性配对码','A'.repeat(64));await invoke(h,'确认连接');
  assert.match(text(h.tree),/操作未执行\/已确认拒绝，请核对提示后重新审阅/);
  assert.match(text(h.tree),/父级拒绝提示/);assert.doesNotMatch(text(h.tree),/所有服务写入已暂停/);
  assert.equal(h.find(n=>n.props['aria-label']==='应用一次性配对码').props.value,'A'.repeat(64));
  assert.equal(h.button('确认连接').props.disabled,false);
  await invoke(h,'确认连接');assert.equal(h.calls.length,2);assert.equal(h.calls[0][1].code,'a'.repeat(64));
});
test('policy acceptance explicitly selects subsets and retention with desired revision/hash; existing acceptance remains visible',async()=>{
  const h=mount({state:{revision:7,connections:[policyConnection]}});
  assert.match(text(h.tree),/已接受策略：版本 2/);assert.deepEqual(h.calls,[]);
  h.click('审阅同步策略：HTTP 服务');await invoke(h,'确认接受策略');assert.deepEqual(h.calls,[]);h.click('取消');
  selectPolicy(h);
  for(const days of ['0','15','31','1.5']){h.change('保留天数',days);await invoke(h,'确认接受策略');assert.deepEqual(h.calls,[]);}
  h.change('保留天数','5');await invoke(h,'确认接受策略');
  assert.deepEqual(h.calls,[['serviceAcceptPolicy',{revision:7,connectionId:'c1',desiredRevision:3,desiredHash:'a'.repeat(64),
    scope:{bindingIds:['b1'],dataCategories:['USAGE_SUMMARY'],trigger:'MANUAL',retentionDays:5}}]]);
});
test('policy confirmation rejects stale account, origin, binding identity and desired revision/hash',async()=>{
  for(const patch of [
    {accounts:[{...account,version:5}]},{accounts:[{...account,storeId:'1'}]}, {accounts:[]}, {accountReady:false},
    {origin:'https://other.example'}, {state:{revision:8,connections:[policyConnection]}},
    ...[{bindings:[{...binding,revoked:true}]},{bindings:[{...binding,authEpoch:2}]},
      {policy:{desired:{...desired,desiredRevision:4}}},{policy:{desired:{...desired,desiredHash:'b'.repeat(64)}}}]
      .map(change=>({state:{revision:7,connections:[{...policyConnection,...change}]}}))
  ]){
    const h=mount({state:{revision:7,connections:[policyConnection]}});selectPolicy(h);
    const handler=h.button('确认接受策略').props.onClick;h.update(patch);await handler();h.render();
    assert.deepEqual(h.calls,[]);assert.match(text(h.tree),/已变化/);
  }
});
test('policy review is offered only for live owned bindings and bounded manual metadata scope',()=>{
  for(const change of [
    {bindings:[{...binding,revoked:true}]}, {bindings:[{...binding,localAccount:{...account,version:3}}, {...binding,bindingId:'b2'}]},
    ...[{trigger:'AUTO'},{retentionDays:31},{dataCategories:['COOKIE']},{bindingIds:['foreign']}]
      .map(scope=>({policy:{desired:{...desired,scope:{...desired.scope,...scope}}}}))
  ]){
    const h=mount({state:{revision:7,connections:[{...policyConnection,...change}]}});
    assert.ok(!h.find(n=>n.props['aria-label']==='审阅同步策略：HTTP 服务'));assert.deepEqual(h.calls,[]);
  }
});
test('status reread, pending reconciliation and archive availability use authoritative view',async()=>{
  const h=mount();await invoke(h,'读取回执：HTTP 服务');assert.equal(h.calls[0][0],'serviceStatus');
  for(const canArchive of [false,true]){
    const h=mount({state:{revision:7,connections:[{...connection,status:'OUTCOME_UNKNOWN',
      pending:{action:'serviceOpen',canArchive}}]}});
    assert.equal(Boolean(h.find(n=>n.type==='button'&&text(n)==='核对并归档未知打开')),canArchive);
    await invoke(h,'读取回执：HTTP 服务');assert.equal(h.calls[0][0],'serviceReconcile');
  }
});
test('retirement permits only explicitly eligible old or receipt-only unknown connections and retains warning',async()=>{
  for(const status of ['SESSION_EXPIRED','INVALIDATED','OUTCOME_UNKNOWN']){
    const h=mount({state:{revision:7,connections:[{...connection,status,canRetire:true,
      ...(status==='OUTCOME_UNKNOWN'?{pending:{action:'serviceDisconnect',receiptOnly:true}}:{})}]}});
    assert.equal(h.button('连接服务：HTTP 服务').props.disabled,true);
    h.click('归档旧连接：HTTP 服务');assert.match(text(h.tree),/不表示远端撤销或未知操作失败/);
    assert.match(text(h.tree),/未知配对可能已创建设备/);
    assert.deepEqual(h.calls,[]);await invoke(h,'确认归档旧连接');
    assert.deepEqual(h.calls,[['serviceRetire',{revision:7,connectionId:'c1'}]]);
  }
  for(const c of [connection,{...connection,status:'OUTCOME_UNKNOWN',pending:{action:'serviceBind'},canRetire:false}]){
    const h=mount({state:{revision:7,connections:[c]}});
    assert.ok(!h.find(n=>n.props['aria-label']==='归档旧连接：HTTP 服务'));
  }
  const h=mount({state:{revision:7,connections:[{...connection,status:'RETIRED',pending:{action:'serviceDisconnect'}}]}});
  assert.match(text(h.tree),/已归档（远端状态未声明）/);
  for(const node of nodes(h.tree).filter(n=>n.type==='article').flatMap(nodes).filter(n=>n.type==='button')){
    if(node.props['aria-label']==='读取回执：HTTP 服务')assert.equal(node.props.disabled,false);
    else assert.equal(node.props.disabled,true,text(node));
  }
  await invoke(h,'读取回执：HTTP 服务');assert.equal(h.calls[0][0],'serviceReconcile');
});
test('resource pagination explicitly sends next cursor while ordinary read resets page',async()=>{
  const h=mount({state:{revision:7,connections:[{...connection,resourceCursor:16}]}});
  await invoke(h,'读取更多资源：HTTP 服务');await invoke(h,'读取资源：HTTP 服务');
  assert.deepEqual(h.calls,[['serviceResources',{revision:7,connectionId:'c1',cursor:16}],
    ['serviceResources',{revision:7,connectionId:'c1'}]]);
  h.update({state:{revision:8,connections:[{...connection,resourceCursor:null}]}});
  assert.ok(!h.find(n=>n.props['aria-label']==='读取更多资源：HTTP 服务'));
  assert.match(text(h.tree),/每次公开网络请求都需要宿主的一次性审阅/);
});

test('retirement confirmation cannot survive eligibility or revision change',async()=>{
  for(const patch of [{revision:8,canRetire:true},{revision:7,canRetire:false}]){
    const h=mount({state:{revision:7,connections:[{...connection,status:'INVALIDATED',canRetire:true}]}});
    h.click('归档旧连接：HTTP 服务');const handler=h.button('确认归档旧连接').props.onClick;
    h.update({state:{revision:patch.revision,connections:[{...connection,status:'INVALIDATED',canRetire:patch.canRetire}]}});
    await handler();h.render();assert.deepEqual(h.calls,[]);assert.match(text(h.tree),/已变化/);
  }
});
