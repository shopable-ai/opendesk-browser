import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {createRequire} from 'node:module';

// Run the actual sharing presenter and handlers. Only React scheduling and
// Host transport are substituted; this is component evidence, not Chrome.
const require=createRequire(import.meta.url);
const built=buildSync({entryPoints:[
  'examples/sidebar-tools/cookie-editor/app/components/CookieAccountSharing.jsx'
],bundle:true,write:false,format:'cjs',platform:'node',external:['react'],jsx:'transform'});
const nodes=node=>node&&typeof node==='object'?[node,...node.children.flatMap(nodes)]:[];
const text=node=>node&&typeof node==='object'?node.children.map(text).join(''):String(node??'');
function receive(request,kind='receive'){
  const slots=[],effects=[];let cursor=0,tree,changed=true;
  const React={
    createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),
    useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;
      return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;changed=true;}];},
    useRef(value){const i=cursor++;return slots[i]??={current:value};},
    useEffect(fn,deps){const i=cursor++,old=slots[i];
      if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))
        effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});}
  };
  const module={exports:{}};
  new Function('require','module','exports',built.outputFiles[0].text)(
    name=>name==='react'?React:require(name),module,module.exports);
  const render=()=>{cursor=0;changed=false;
    tree=(kind==='send'?module.exports.CookieAccountShareLive:module.exports.CookieAccountReceive)({
      request,origin:'https://example.com',onBack(){},
      account:{alias:'acct_source',version:1,displayName:'工作账号',cookieCount:3}});
    for(const effect of effects.splice(0))effect();};
  const find=predicate=>nodes(tree).find(predicate);
  const flush=async()=>{for(let i=0;i<20;i++){if(changed)render();await Promise.resolve();}};
  render();
  return {flush,find,text:()=>text(tree),
    async field(label,value){
      const field=find(n=>n.props['aria-label']===label);
      assert.ok(field,'UI must expose the visible field: '+label);
      field.props.onChange({target:{value}});await flush();
    },
    async inspect(){
      find(n=>n.type==='input').props.onChange({target:{value:'https://relay.invalid/i/'+ 'a'.repeat(32)}});
      await flush();
      find(n=>n.type==='button'&&text(n)==='查看邀请').props.onClick();await flush();
    }};
}
const invitation={id:'a'.repeat(32),origin:'https://example.com',displayName:'工作账号',
  description:'配置',mode:'configuration',expiresAt:Date.now()+3600000,remainingClaims:0,revoked:false};

test('reopening an imported configuration shows the saved result without offering another claim',async()=>{
  const calls=[];
  const app=receive(async action=>{calls.push(action);return {
    url:'https://relay.invalid/i/'+invitation.id,invite:invitation,
    configurationImported:true,localSavePending:false,
    cookieWriteVerified:false,websiteLoginConfirmed:false};});
  await app.inspect();
  assert.match(app.text(),/配置已保存/);
  assert.match(app.text(),/Cookie 未写入，网站登录尚未验证/);
  assert.equal(app.find(n=>n.type==='button'&&text(n)==='领取账号配置'),undefined);
  assert.deepEqual(calls,['shareInspect']);
});

test('a pending local save remains available even after the last remote claim was consumed',async()=>{
  const calls=[];
  const app=receive(async action=>{calls.push(action);return action==='shareInspect'?{
    url:'https://relay.invalid/i/'+invitation.id,invite:invitation,
    localSavePending:true,configurationImported:false}:{status:'configuration_imported'};});
  await app.inspect();
  const save=app.find(n=>n.type==='button'&&text(n)==='继续保存已领取配置');
  assert.equal(save.props.disabled,false);save.props.onClick();await app.flush();
  assert.match(app.text(),/配置已保存/);
  assert.deepEqual(calls,['shareInspect','shareClaim']);
});

test('an unknown local claim result never offers another claim after reopening',async()=>{
  const calls=[];
  const app=receive(async action=>{calls.push(action);
    throw Object.assign(Error('unknown'),{code:'E_OUTCOME_UNKNOWN'});});
  await app.inspect();
  assert.match(app.text(),/结果未知/);
  assert.equal(app.find(n=>n.type==='button'&&text(n)==='领取账号配置'),undefined);
  assert.deepEqual(calls,['shareInspect']);
});

test('session sender uses the original invitation entry and only one claim',async()=>{
  const calls=[];
  const app=receive(async(action,payload)=>{calls.push({action,payload});return {
    ref:'ref-1',url:'https://relay.invalid/i/'+invitation.id,phase:'active',
    invite:{...invitation,mode:'session',remainingClaims:1}};},'send');
  await app.field('分享内容','session');
  await app.field('局域网 HTTPS 分享服务','https://relay.invalid');
  app.find(n=>n.type==='button'&&text(n)==='生成真实邀请').props.onClick();await app.flush();
  assert.equal(calls[0].action,'shareCreate');
  assert.equal(calls[0].payload.mode,'session');
  assert.equal(calls[0].payload.maxClaims,1);
  assert.match(app.text(),/配对/);
  assert.doesNotMatch(app.text(),/不包含 Cookie。配置领取后/);
});

test('session receiver requires pairing and a reviewed sender fingerprint before claiming',async()=>{
  const calls=[],receiverFingerprint='a'.repeat(64),senderFingerprint='b'.repeat(64);
  const inspected={url:'https://relay.invalid/i/'+invitation.id,
    invite:{...invitation,mode:'session',remainingClaims:1},sessionAvailable:true};
  const app=receive(async(action,payload)=>{
    calls.push({action,payload});
    if(action==='shareInspect')return inspected;
    if(action==='sharePair')return {...inspected,pair:{requestId:'r'.repeat(32),receiverFingerprint}};
    return {status:'session_imported',sessionImported:true,cookieWriteVerified:false,websiteLoginConfirmed:false};
  });
  await app.inspect();
  assert.equal(app.find(n=>n.type==='button'&&text(n)==='领取加密会话快照'),undefined);
  const pair=app.find(n=>n.type==='button'&&text(n)==='请求设备配对');
  assert.ok(pair,'A session invitation needs the explicit device-pairing action');
  pair.props.onClick();await app.flush();
  assert.match(app.text(),new RegExp(receiverFingerprint));
  assert.equal(app.find(n=>n.type==='button'&&text(n)==='领取加密会话快照').props.disabled,true);
  await app.field('已核对的发送设备指纹',senderFingerprint);
  app.find(n=>n.type==='button'&&text(n)==='领取加密会话快照').props.onClick();await app.flush();
  assert.equal(calls[2].payload.senderFingerprint,senderFingerprint);
  assert.match(app.text(),/会话快照已保存/);
  assert.match(app.text(),/Cookie 未写入，网站登录尚未验证/);
  assert.deepEqual(calls.map(x=>x.action),['shareInspect','sharePair','shareClaim']);
});
