import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
const built=buildSync({entryPoints:[new URL('../../ai-account-usage/web/TeamAccounts.jsx',import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'node',external:['react'],jsx:'transform'}).outputFiles[0].text;
function load(React={}){const module={exports:{}};new Function('require','module','exports',built)(()=>React,module,module.exports);return module.exports;}
const {createTeamApi,createTeamManager}=load();
function storage(initial=null){let value=initial;return {getItem:()=>value,setItem:(_key,next)=>{value=next;},removeItem:()=>{value=null;}};}
const account={accountId:'account_one',version:3,displayName:'团队账号',origin:'https://example.com',expiresAt:Date.now()+86400000};
const device={deviceId:'device_one',label:'工作电脑'};
const assignment={accountId:account.accountId,accountVersion:2,deviceId:device.deviceId,assignmentRevision:7,revoked:false};
const data={accounts:[account],devices:[device],assignments:[assignment]};
const response=value=>({ok:true,json:async()=>value});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('authenticated reads are GET only; member or resource gate fails closed',async()=>{
  const calls=[];
  const api=createTeamApi(async(path,options)=>{calls.push({path,options});return response(path.endsWith('/devices')?{readOnly:false,devices:[device]}:data);});
  const manager=createTeamManager({api,storage:storage()});await manager.load();
  assert.equal(manager.state().allowed,true);assert.equal(calls.length,2);
  for(const {options} of calls){assert.equal(options.method,'GET');assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.body,undefined);}
  let listCalls=0;
  for(const readOnly of [true,undefined]){
    const member=createTeamManager({storage:storage(),api:{devices:async()=>({readOnly}),list:async()=>{listCalls++;return data;}}});
    await assert.rejects(member.load());await assert.rejects(member.submit('publish',{}));assert.equal(member.state().allowed,false);
  }
  assert.equal(listCalls,0);
});

test('unknown assignment journals ID/action only and blocks double clicks and reload replay until original receipt',async()=>{
  const local=storage(),calls=[];let finish;
  const api={devices:async()=>({readOnly:false,devices:[device]}),list:async()=>data,
    submit:async(action,body)=>{calls.push({action,body});return new Promise((_resolve,reject)=>{finish=()=>reject(Error('secret-token-response'));});},
    receipt:async id=>({operationId:id,status:'CONFIRMED',assignment})};
  const manager=createTeamManager({api,storage:local,newId:()=> 'op_original'});await manager.load();
  const body={accountId:account.accountId,deviceId:device.deviceId,inviteUrl:'https://relay.example/i/'+'x'.repeat(22),senderFingerprint:'a'.repeat(64)};
  const pending=manager.submit('assign',body);await assert.rejects(manager.submit('assign',body));
  await tick();
  assert.deepEqual(JSON.parse(local.getItem()),{operationId:'op_original',action:'assign'});
  finish();await assert.rejects(pending,{code:'UNKNOWN'});
  const reopened=createTeamManager({api,storage:local,newId:()=> 'op_new'});await reopened.load();
  await assert.rejects(reopened.submit('assign',body));assert.equal(calls.length,1);
  const receipt=await reopened.reconcile();assert.equal(receipt.operationId,'op_original');assert.equal(local.getItem(),null);
  assert.equal(reopened.state().allowed,false,'fresh list is required after confirmation');
});

test('wrong, absent and non-final receipts cannot clear unknown journal',async()=>{
  for(const value of [{operationId:'different',status:'CONFIRMED'},{operationId:'op_original',status:'PENDING'},null]){
    const local=storage(JSON.stringify({operationId:'op_original',action:'revoke'}));
    const manager=createTeamManager({storage:local,api:{devices:async()=>({readOnly:false}),list:async()=>data,receipt:async()=>value}});
    await manager.load();await assert.rejects(manager.reconcile());assert.ok(local.getItem());await assert.rejects(manager.submit('revoke',{}));
  }
});

test('corrupt or unavailable journal never sends POST; missing assignments remains unknown',async()=>{
  for(const local of [storage('{'),{getItem(){throw Error();}},{getItem:()=>null,setItem(){throw Error();}}]){
    let posts=0;const manager=createTeamManager({storage:local,api:{devices:async()=>({readOnly:false}),list:async()=>({...data,assignments:undefined}),submit:async()=>{posts++;}}});
    await manager.load();assert.equal(manager.state().data.assignments,null);await assert.rejects(manager.submit('publish',{}));assert.equal(posts,0);
  }
});

test('write and receipt transport never exposes server diagnostics or follows redirects',async()=>{
  const calls=[];const api=createTeamApi(async(path,options)=>{calls.push({path,options});
    if(options.method==='POST')return {ok:false,status:503,json:async()=>{throw Error('secret');}};
    return response({operationId:'op_one',status:'CONFIRMED'});});
  await assert.rejects(api.submit('revoke',{operationId:'op_one'}),error=>error.code==='UNKNOWN'&&!error.message.includes('secret'));
  await api.receipt('op_one');assert.equal(calls[1].path,'/opendesk/admin/api/team-operations/op_one');assert.equal(calls[1].options.method,'GET');
  const unknownDenial=createTeamApi(async()=>({ok:false,status:409,json:async()=>{throw Error('token');}}));
  await assert.rejects(unknownDenial.submit('publish',{}),error=>error.code==='UNKNOWN'&&!error.message.includes('token'));
  const rejected=createTeamApi(async()=>({ok:false,status:409,json:async()=>({error:'VERSION_CONFLICT'})}));
  await assert.rejects(rejected.submit('publish',{}),{code:'REJECTED'});
});

// In-memory React harness: exercises actual form handlers without a browser or new dependency.
function harness(fetcher){
  const contexts=new Map(),effects=[];let context,index;
  const React={createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),
    useRef(initial){const slot=index++;return context[slot]??(context[slot]={current:initial});},
    useState(initial){const slot=index++,owner=context;if(!(slot in owner))owner[slot]=typeof initial==='function'?initial():initial;
      return [owner[slot],value=>{owner[slot]=typeof value==='function'?value(owner[slot]):value;}];},
    useEffect(fn,deps){const slot=index++,old=context[slot];if(!old||deps.some((d,i)=>d!==old[i])){context[slot]=deps;effects.push(fn);}}};
  const module=load(React);
  function render(type=module.TeamAccounts,props={}){
    context=contexts.get(type)??[];contexts.set(type,context);index=0;
    const tree=type(props);
    function expand(node){if(!node||typeof node!=='object')return node;
      if(typeof node.type==='function')return render(node.type,node.props);
      if(node.type==='dialog')node.props.ref.current={showModal(){},close(){}};
      return {...node,children:node.children.map(expand)};
    }
    return expand(tree);
  }
  return {render,async flush(){while(effects.length)effects.shift()();await tick();},fetcher};
}
const nodes=n=>!n||typeof n!=='object'?[]:[n,...n.children.flatMap(nodes)];
const text=n=>!n||typeof n!=='object'?String(n??''):n.children.map(text).join('');
const button=(tree,label)=>nodes(tree).find(n=>n.type==='button'&&text(n)===label);
const labelInput=(tree,label)=>nodes(tree).find(n=>n.type==='label'&&text(n).startsWith(label))?.children.find(n=>['input','select'].includes(n?.type));

test('UI hides demo/resource/member management; exact device fallback, metadata update, assignment and revoke use current versions',async()=>{
  const original={fetch:globalThis.fetch,localStorage:globalThis.localStorage,document:globalThis.document};
  try{
    globalThis.document={activeElement:null};
    for(const props of [{isDemo:true},{resourceView:true},{}]){
      const calls=[];globalThis.localStorage=storage();globalThis.fetch=async(path,options)=>{calls.push({path,options});return response({readOnly:true});};
      const app=harness();assert.equal(app.render(undefined,props),null);await app.flush();assert.equal(app.render(undefined,props),null);
      assert.equal(calls.length,Object.keys(props).length?0:1);
    }
    const calls=[];globalThis.localStorage=storage();globalThis.fetch=async(path,options)=>{calls.push({path,options});
      if(path.endsWith('/devices'))return response({readOnly:false,devices:[device]});
      if(options.method==='POST'){const body=JSON.parse(options.body);return response({status:'CONFIRMED',operationId:body.operationId,account,assignment});}
      return response(data);
    };
    const app=harness();app.render();await app.flush();let tree=app.render();
    button(tree,'团队账号管理').props.onClick();tree=app.render();await app.flush();tree=app.render();
    assert.ok(text(tree).includes('工作电脑 · device_one'));assert.ok(!text(tree).includes('示例成员'));
    button(tree,'更新 团队账号 元数据').props.onClick();tree=app.render();
    const form=nodes(tree).find(n=>n.type==='form');await form.props.onSubmit({preventDefault(){}});await tick();tree=app.render();
    let post=calls.filter(c=>c.options.method==='POST').at(-1);assert.equal(post.path,'/opendesk/admin/api/team-accounts');
    assert.deepEqual({...JSON.parse(post.options.body),operationId:'id'},{operationId:'id',accountId:account.accountId,expectedVersion:3,displayName:account.displayName,origin:account.origin,expiresAt:Date.parse(labelInput(tree,'到期时间').props.value)});
    labelInput(tree,'团队账号').props.onChange({target:{value:account.accountId}});tree=app.render();
    labelInput(tree,'接收设备').props.onChange({target:{value:device.deviceId}});tree=app.render();
    const invite='https://relay.example/i/'+'x'.repeat(22);
    labelInput(tree,'原分享功能').props.onChange({target:{value:invite}});labelInput(tree,'发送端指纹').props.onChange({target:{value:'b'.repeat(64)}});tree=app.render();
    await nodes(tree).filter(n=>n.type==='form')[1].props.onSubmit({preventDefault(){}});await tick();tree=app.render();
    post=calls.filter(c=>c.options.method==='POST').at(-1);assert.equal(post.path,'/opendesk/admin/api/team-assignments');
    assert.deepEqual({...JSON.parse(post.options.body),operationId:'id'},{operationId:'id',accountId:account.accountId,accountVersion:3,deviceId:device.deviceId,expectedRevision:7,inviteUrl:invite,senderFingerprint:'b'.repeat(64)});
    assert.equal(labelInput(tree,'原分享功能').props.value,'');assert.equal(labelInput(tree,'发送端指纹').props.value,'');
    button(tree,'撤销所选设备分配').props.onClick();await tick();
    post=calls.filter(c=>c.options.method==='POST').at(-1);assert.equal(post.path,'/opendesk/admin/api/team-revoke');
    assert.deepEqual({...JSON.parse(post.options.body),operationId:'id'},{operationId:'id',accountId:account.accountId,deviceId:device.deviceId,expectedRevision:7});
  }finally{Object.assign(globalThis,original);}
});

test('initial allocation accepts null fingerprint; editing same allocation supplements it at next revision',async()=>{
  const original={fetch:globalThis.fetch,localStorage:globalThis.localStorage,document:globalThis.document};
  try{
    globalThis.document={activeElement:null};globalThis.localStorage=storage();
    let current={...data,assignments:[]};const posts=[];
    globalThis.fetch=async(path,options)=>{
      if(path.endsWith('/devices'))return response({readOnly:false,devices:[device]});
      if(options.method!=='POST')return response(current);
      const body=JSON.parse(options.body);posts.push(body);
      const saved={...assignment,accountVersion:3,assignmentRevision:body.expectedRevision+1};
      current={...current,assignments:[saved]};return response({status:'CONFIRMED',operationId:body.operationId,assignment:saved});
    };
    const app=harness();app.render();await app.flush();button(app.render(),'团队账号管理').props.onClick();app.render();await app.flush();let tree=app.render();
    labelInput(tree,'团队账号').props.onChange({target:{value:account.accountId}});tree=app.render();
    labelInput(tree,'接收设备').props.onChange({target:{value:device.deviceId}});tree=app.render();
    const invite='https://relay.example/i/'+'q'.repeat(22);
    labelInput(tree,'原分享功能').props.onChange({target:{value:invite}});tree=app.render();
    assert.equal(labelInput(tree,'发送端指纹').props.required,undefined);
    nodes(tree).filter(n=>n.type==='form')[1].props.onSubmit({preventDefault(){}});await tick();tree=app.render();
    assert.equal(posts.length,1);assert.equal(posts[0].senderFingerprint,null);assert.equal(posts[0].expectedRevision,0);
    assert.ok(button(tree,'更新该设备分配 / 补填指纹'));
    labelInput(tree,'原分享功能').props.onChange({target:{value:invite}});
    labelInput(tree,'发送端指纹').props.onChange({target:{value:'c'.repeat(64)}});tree=app.render();
    nodes(tree).filter(n=>n.type==='form')[1].props.onSubmit({preventDefault(){}});await tick();
    assert.equal(posts.length,2);assert.equal(posts[1].senderFingerprint,'c'.repeat(64));assert.equal(posts[1].expectedRevision,1);
    assert.equal(posts[1].accountId,posts[0].accountId);assert.equal(posts[1].deviceId,posts[0].deviceId);
    assert.equal(current.assignments[0].assignmentRevision,2);
  }finally{Object.assign(globalThis,original);}
});


test('two preloaded managers serialize in-flight submissions with real Web Locks and preserve a lost-response journal',async()=>{
  const local=storage(),posts=[];let finish;let committed=false;
  const api={devices:async()=>({readOnly:false}),list:async()=>data,
    submit:async(action,body)=>{posts.push({action,body});committed=true;
      return new Promise((_resolve,reject)=>{finish=()=>reject(Error('response lost after commit'));});},
    receipt:async operationId=>({operationId,status:'CONFIRMED'})};
  const a=createTeamManager({api,storage:local,newId:()=> 'op_a'});
  const b=createTeamManager({api,storage:local,newId:()=> 'op_b'});
  await Promise.all([a.load(),b.load()]);assert.equal(b.state().pending,null);
  const first=assert.rejects(a.submit('publish',{}),{code:'UNKNOWN'});await tick();
  assert.equal(committed,true);
  const journal=local.getItem();
  const second=assert.rejects(b.submit('revoke',{}),{code:'UNKNOWN'});await tick();
  assert.equal(b.state().busy,true,'B waits for A to release the same-origin lock');
  assert.equal(posts.length,1);assert.equal(local.getItem(),journal);
  finish();await Promise.all([first,second]);
  assert.equal(posts.length,1);assert.equal(local.getItem(),journal);
  assert.equal(b.state().pending.operationId,'op_a');
  await b.load();await assert.rejects(b.submit('assign',{}));
  const receipt=await b.reconcile();assert.equal(receipt.operationId,'op_a');assert.equal(local.getItem(),null);
  // A's stale in-memory journal must not delete B's later operation.
  await b.load();const next=assert.rejects(b.submit('revoke',{}),{code:'UNKNOWN'});await tick();finish();await next;
  await a.load();assert.equal(a.state().pending.operationId,'op_b');
  await a.reconcile();assert.equal(local.getItem(),null);assert.equal(posts.length,2);
});

test('clearing after confirmed, rejected or reconciled results checks the stored operation ID',async()=>{
  for(const result of ['confirmed','rejected','reconciled']){
    const local=storage(result==='reconciled'?JSON.stringify({operationId:'op_original',action:'assign'}):null);
    const replacement=JSON.stringify({operationId:'op_other',action:'revoke'});
    const replace=()=>local.setItem('',replacement);
    const manager=createTeamManager({storage:local,newId:()=> 'op_original',api:{
      devices:async()=>({readOnly:false}),list:async()=>data,
      submit:async(_action,body)=>{replace();if(result==='rejected')throw Object.assign(Error(),{code:'REJECTED'});
        return {operationId:body.operationId,status:'CONFIRMED'};},
      receipt:async operationId=>{replace();return {operationId,status:'CONFIRMED'};}
    }});
    await manager.load();
    await assert.rejects(result==='reconciled'?manager.reconcile():manager.submit('publish',{}),{code:'UNKNOWN'});
    assert.equal(local.getItem(),replacement);assert.equal(manager.state().pending.operationId,'op_other');
    await manager.load();await assert.rejects(manager.submit('publish',{}));
  }
});

test('missing or denied Web Locks fails closed without a journal write or POST',async()=>{
  for(const locks of [null,{}, {request:async()=>{throw Error('locks denied');}}]){
    let posts=0,writes=0;
    const manager=createTeamManager({locks,storage:{getItem:()=>null,setItem(){writes++;},removeItem(){writes++;}},
      api:{devices:async()=>({readOnly:false}),list:async()=>data,submit:async()=>{posts++;}}});
    await manager.load();await assert.rejects(manager.submit('publish',{}));
    assert.equal(manager.state().blocked,true);assert.equal(posts,0);assert.equal(writes,0);
  }
});

test('two already-open UI instances cannot overwrite or clear a committed operation after its response is lost',async()=>{
  const original={fetch:globalThis.fetch,localStorage:globalThis.localStorage,document:globalThis.document};
  try{
    globalThis.document={activeElement:null};const local=globalThis.localStorage=storage();
    const posts=[];let committedVersion=account.version;
    globalThis.fetch=async(path,options)=>{
      if(path.endsWith('/devices'))return response({readOnly:false,devices:[device]});
      if(options.method==='POST'){
        const body=JSON.parse(options.body);posts.push(body);committedVersion++;
        throw Error('committed but response lost');
      }
      return response(data);
    };
    const a=harness(),b=harness();
    for(const app of [a,b]){
      app.render();await app.flush();button(app.render(),'团队账号管理').props.onClick();
      app.render();await app.flush();button(app.render(),'更新 团队账号 元数据').props.onClick();
    }
    const staleB=b.render();
    nodes(a.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await tick();
    const journal=local.getItem();assert.ok(journal);assert.equal(committedVersion,account.version+1);
    nodes(staleB).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await tick();
    assert.equal(posts.length,1);assert.equal(local.getItem(),journal);
    const tree=b.render();assert.ok(text(tree).includes(JSON.parse(journal).operationId));
    assert.ok(nodes(tree).filter(n=>n.type==='fieldset').every(n=>n.props.disabled));
    assert.ok(text(tree).includes('操作结果未知'));
  }finally{Object.assign(globalThis,original);}
});
