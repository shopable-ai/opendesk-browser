import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build, transform } from 'esbuild';
import { runInNewContext } from 'node:vm';

const bundled = await build({entryPoints:[new URL('../src/ui/optionsRoute.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const routes = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const navBundle = await build({entryPoints:[new URL('../src/ui/navigation.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {createNavigation} = await import(`data:text/javascript;base64,${Buffer.from(navBundle.outputFiles[0].text).toString('base64')}`);
const translations=JSON.parse(await readFile(new URL('../src/i18n/locales/en.json',import.meta.url),'utf8'));
const code = (await transform(await readFile(new URL('../src/ui/SourcesPage.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'})).code;
function fixture(route={kind:'local'},quickEntry='local') {
  const hooks=[],effects=[],drafts=new Map(),confirmations=[],actions=[];
  let cursor=0,revision=0,tree;
  const opener={isConnected:true,focus(){this.focused=true;}};
  const document={activeElement:opener,body:{},visibilityState:'visible',querySelectorAll:()=>[]};
  const navigation=createNavigation({initialRoute:routes.subscriptionRouteHash(route)});
  const env={navigation,getDraftRevision:scope=>drafts.get(scope)??0,isDraftDirty:scope=>drafts.has(scope),
    setDraftDirty(value,scope,expected){if(value)drafts.set(scope,++revision);else if(expected===undefined||(drafts.get(scope)??0)===expected)drafts.delete(scope);else return false;return true;},
    confirm:message=>new Promise(resolve=>confirmations.push({message,resolve}))};
  navigation.setGuard(()=>!drafts.size);
  const react={useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=initial;return [hooks[i],value=>{hooks[i]=typeof value==='function'?value(hooks[i]):value;}];},
    useRef(initial){const i=cursor++;return hooks[i]??={current:initial};},
    useEffect(fn,deps){const i=cursor++,previous=hooks[i];if(!previous||deps.some((v,n)=>v!==previous.deps[n]))effects.push(()=>{previous?.cleanup?.();hooks[i]={deps,cleanup:fn()};});}};
  const jsx=(type,props)=>({type,props:props??{}});
  const module={exports:{}};
  runInNewContext(code,{module,exports:module.exports,require(name){
    if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
    if(name==='../environment')return {getEnvironment:()=>env};
    if(name==='../i18n/LocaleProvider')return {useI18n:()=>({t:key=>{assert.ok(Object.hasOwn(translations,key),`Unknown translation: ${key}`);return key;}})};
    if(name==='../official/messages')return {requestOfficial:async()=>({ok:false})};
    if(name==='../domain/proxy-entry')return {isValidProxyPort:value=>Number(value)>0&&Number(value)<=65535};
    return new Proxy({}, {get:(_,key)=>key});
  },document,HTMLElement:class {static [Symbol.hasInstance](value){return value===opener;}},window:{addEventListener(){},removeEventListener(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){},crypto:{randomUUID:()=> 'new-id'}});
  const props={route,quickEntry,busy:false,config:{endpoints:[{id:'a',sourceId:'local',name:'First',scheme:'http',port:7891},{id:'b',sourceId:'local',name:'Second',scheme:'socks5',port:9000}],sources:[{id:'local',kind:'local-client'}],profiles:[],selection:{}},runtime:{},act:async message=>{actions.push(message);return {};},setError(){},setErrorKey(){},navigate:section=>navigation.navigate('#/'+section),navigateSubscription:route=>navigation.navigate(routes.subscriptionRouteHash(route))};
  function render(update={}){Object.assign(props,update);for(let n=0;n<3;n++){cursor=0;tree=module.exports.SourcesPage(props);while(effects.length)effects.shift()();}return tree;}
  function all(node){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(all)];}
  const find=predicate=>all(tree).find(predicate);
  const field=id=>find(node=>node.props.id===id);
  return {env,props,navigation,confirmations,actions,opener,render,find,field,
    editor:()=>find(node=>node.props.id==='source-editor'),
    cancel:()=>find(node=>node.props.children==='cancel').props.onClick(),
    change(id,value){field(id).props.onValueChange(value);env.setDraftDirty(true,'source-editor');render();}};
}

test('safe local endpoint routes round trip, copy and navigate; malformed IDs never reach guards',()=>{
 for(const id of ['a','Endpoint_-9','a'.repeat(80)]){
  const hash='#/subscriptions/local/'+id;
  assert.deepEqual(routes.parseSubscriptionRoute(hash),{kind:'local',id});
  assert.equal(routes.subscriptionRouteHash({kind:'local',id}),hash);
  assert.equal(routes.copyableOptionsHash(hash),hash);
  assert.equal(createNavigation().navigate(hash),true);
 }
 for(const id of ['', 'a'.repeat(81),'a%2Fb','a?token=secret','a#secret','a/b','中文','a\n']){
  const hash='#/subscriptions/local/'+id;
  assert.equal(routes.parseSubscriptionRoute(hash).kind,'invalid');
  assert.throws(()=>routes.subscriptionRouteHash({kind:'local',id}));
  assert.equal(routes.copyableOptionsHash(hash),'#/subscriptions');
  const nav=createNavigation();nav.setGuard(()=>assert.fail('unsafe route reached guard'));
  assert.equal(nav.navigate(hash,{force:true}),false);
 }
});

test('Cancel and Escape keep every local field when dirty discard is declined',async()=>{
 for(const escape of [false,true]){
  const f=fixture();f.render();f.change('r72-local-name','Draft');f.change('r72-local-port','8123');
  const pending=escape?f.editor().props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){}}):f.cancel();
  assert.equal(f.confirmations.length,1);
  f.confirmations[0].resolve(false);await pending;await Promise.resolve();f.render();
  assert.equal(f.field('r72-local-name').props.value,'Draft');assert.equal(f.field('r72-local-port').props.value,'8123');
  assert.equal(f.env.isDraftDirty('source-editor'),true);
 }
});

test('Keep retains the token-bearing subscription URL; discard clears only source scope and restores focus',async()=>{
 const f=fixture({kind:'new'},'subscription');f.render();f.change('r72-sub-name','Private');f.change('r72-sub-url','https://example.test/sub?token=secret');
 let pending=f.cancel();assert.equal(f.confirmations.length,1);assert.ok(!f.confirmations[0].message.includes('secret'));
 f.confirmations[0].resolve(false);await pending;f.render();assert.equal(f.field('r72-sub-url').props.value,'https://example.test/sub?token=secret');
 f.env.setDraftDirty(true,'other-editor');pending=f.cancel();f.confirmations[1].resolve(true);await pending;f.render();
 assert.equal(f.editor(),undefined);assert.equal(f.env.isDraftDirty('source-editor'),false);assert.equal(f.env.isDraftDirty('other-editor'),true);assert.equal(f.opener.focused,true);
});

test('busy rejects explicit close before prompting or clearing',async()=>{
 const f=fixture();f.render();f.change('r72-local-port','8123');f.render({busy:true});await f.cancel();f.render();
 assert.equal(f.confirmations.length,0);assert.equal(f.field('r72-local-port').props.value,'8123');assert.ok(f.editor());
});

test('late discard cannot clear newer input or a new clean editor with revision zero',async()=>{
 for(const newerEditor of [false,true]){
  const f=fixture();f.render();f.change('r72-local-port','8123');const pending=f.cancel();assert.equal(f.confirmations.length,1);
  if(newerEditor){f.env.setDraftDirty(false,'source-editor');f.render({route:{kind:'new'},quickEntry:'subscription'});}
  else f.change('r72-local-port','8456');
  f.confirmations[0].resolve(true);await pending;f.render();assert.ok(f.editor());
  if(newerEditor)assert.ok(f.field('r72-sub-url'));else assert.equal(f.field('r72-local-port').props.value,'8456');
 }
});

test('local route ID loads exact endpoint, updates within local type, and never replaces dirty input',()=>{
 const f=fixture({kind:'local',id:'a'});f.render();assert.equal(f.field('r72-local-port').props.value,'7891');
 f.render({route:{kind:'local',id:'b'}});assert.equal(f.field('r72-local-name').props.value,'Second');
 f.change('r72-local-port','8123');f.render({route:{kind:'local',id:'a'}});assert.equal(f.field('r72-local-port').props.value,'8123');
});

test('missing local endpoint ID cannot open an add form or retain another endpoint editor',()=>{
 const f=fixture({kind:'local',id:'a'});f.render();f.render({route:{kind:'local',id:'missing'}});assert.equal(f.editor(),undefined);
 const missing=fixture({kind:'local',id:'missing'});missing.render();assert.equal(missing.editor(),undefined);
});

test('local edit saves original ID and returns profiles; new local returns subscriptions',async()=>{
 for(const id of ['a',undefined]){
  const f=fixture({kind:'local',...(id?{id}:{})});f.render();f.change('r72-local-port','8123');
  await f.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});await new Promise(setImmediate);f.render();
  assert.equal(f.actions[0].client.id,id??'new-id');assert.equal(f.navigation.getRoute(),id?'#/profiles':'#/subscriptions');assert.equal(f.confirmations.length,0);
 }
});

test('confirmed local edit cancel returns profiles; breadcrumb back uses navigation guard without clearing',async()=>{
 const f=fixture({kind:'local',id:'a'});f.render();f.change('r72-local-port','8123');
 f.find(node=>node.props.children==='backToProxyProfiles').props.onClick();
 assert.equal(f.navigation.getRoute(),'#/subscriptions/local/a');assert.equal(f.env.isDraftDirty('source-editor'),true);
 const pending=f.cancel();assert.equal(f.confirmations.length,1);f.confirmations[0].resolve(true);await pending;f.render();
 assert.equal(f.navigation.getRoute(),'#/profiles');assert.equal(f.editor(),undefined);
});
