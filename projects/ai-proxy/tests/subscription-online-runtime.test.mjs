import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {runInNewContext} from 'node:vm';
import * as downloads from '../src/subscription/download.ts';

const code = (await transform(await readFile(new URL('../src/ui/SubscriptionReader.tsx',import.meta.url),'utf8'),
  {loader:'tsx',format:'cjs',jsx:'automatic'})).code;
const privateUrl = 'https://provider.example.com/sub?token=PRIVATE';
function fixture() {
  const hooks=[], effects=[], calls=[], parses=[], actions=[];
  let cursor=0, tree;
  const react={useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=initial;return [hooks[i],value=>{hooks[i]=typeof value==='function'?value(hooks[i]):value;}];},
    useRef(initial){const i=cursor++;return hooks[i]??={current:initial};},
    useEffect(fn,deps){const i=cursor++,prev=hooks[i];if(!prev||deps.some((v,n)=>v!==prev.deps[n]))effects.push(()=>{prev?.cleanup?.();hooks[i]={deps,cleanup:fn()};});}};
  const jsx=(type,props)=>({type,props:props??{}});
  const env={setDraftDirty(){},download(...args){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});calls.push({args,resolve,reject});return promise;}};
  const report={nodes:[{name:'Safe',compatibility:'chrome-native',scheme:'socks5',server:'proxy.example.com',port:1080,reason:'native_proxy'}],protocols:{socks5:1},invalidCount:0,duplicateCount:0,format:'uri'};
  const parser={parseSubscription:text=>{parses.push(text);return report;},parseSubscriptionReport:()=>null,SUBSCRIPTION_ERROR_CODES:[],SubscriptionParseError:class extends Error {}};
  const module={exports:{}};
  runInNewContext(code,{module,exports:module.exports,TextEncoder,AbortController,crypto:{randomUUID:()=> 'id'},require(name){
    if(name==='react')return react;
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(name==='../environment')return {getEnvironment:()=>env};
    if(name==='../subscription/download')return downloads;
    if(name==='../subscription/parser')return parser;
    if(name==='../i18n/LocaleProvider')return {useI18n:()=>({t:key=>key})};
    if(name==='../domain/config')return {endpointFrom:value=>value};
    return new Proxy({}, {get:(_,key)=>key});
  }});
  const props={source:{id:'sub',originHost:'provider.example.com',displayName:'Provider'},config:{sources:[{kind:'manual',id:'manual'}]},busy:false,initialUrl:privateUrl,act:async message=>{actions.push(message);return {ok:true};},openLocal(){}};
  function render(update={}){Object.assign(props,update);for(let n=0;n<2;n++){cursor=0;tree=module.exports.SubscriptionReader(props);while(effects.length)effects.shift()();}return tree;}
  function all(node){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(child=>all(child))];}
  const find=predicate=>all(tree).find(predicate);
  const field=()=>find(n=>n.props.id==='subscription-reader-sub-url');
  const form=()=>find(n=>n.type==='form'&&n.props.onClick);
  const button=()=>all(form()).find(n=>n.props.type==='submit');
  function open(){find(n=>n.props['aria-controls']==='subscription-reader-sub').props.onClick();render();}
  function gesture(type='click',extra={}){const currentTarget=extra.currentTarget??{reportValidity:()=>true};let prevented=false;
    const event={currentTarget,target:type==='click'?{closest:()=>({form:currentTarget})}:{tagName:'INPUT'},key:'Enter',nativeEvent:{isComposing:false},preventDefault(){prevented=true;},...extra};
    form().props[type==='click'?'onClick':'onKeyDown'](event);return prevented;}
  return {calls,parses,actions,render,find,field,button,form,open,gesture,
    change(value){field().props.onValueChange(value);render();},
    close(){find(n=>n.props.children==='cancel').props.onClick();render();},
    unmount(){for(const hook of hooks)hook?.cleanup?.();}};
}
const flush=()=>new Promise(setImmediate);

test('online click and Enter invoke adapter synchronously with signal and prevent duplicate submissions', async()=>{
  for(const type of ['click','keydown']){
    const f=fixture();f.render();f.open();assert.equal(f.button().props.disabled,false);
    assert.equal(f.gesture(type),true);assert.equal(f.calls.length,1);
    assert.equal(f.calls[0].args[0],privateUrl);assert.equal(f.calls[0].args[1],'provider.example.com');
    assert.equal(f.calls[0].args[2].signal.aborted,false);
    f.form().props.onSubmit({preventDefault(){}});assert.equal(f.calls.length,1);
    f.render();assert.equal(f.button().props.disabled,true);
    f.calls[0].resolve('private raw subscription');await flush();f.render();
    assert.deepEqual(f.parses,['private raw subscription']);
    assert.equal(f.render().props['data-read-status'],'success');assert.equal(f.actions.length,0);
    f.change('https://provider.example.com/new');
    assert.equal(f.render().props['data-read-status'],'unread');
    assert.equal(f.find(n=>n.props.className==='subscriptionReadResult'),undefined);
  }
});

test('download guards empty input, busy, invalid form and composing/modified Enter',()=>{
  const f=fixture();f.render();f.open();
  f.gesture('keydown',{nativeEvent:{isComposing:true}});f.gesture('keydown',{ctrlKey:true});
  f.gesture('click',{currentTarget:{reportValidity:()=>false}});
  assert.equal(f.calls.length,0);
  f.change('   ');assert.equal(f.button().props.disabled,true);f.gesture();assert.equal(f.calls.length,0);
  f.change(privateUrl);f.render({busy:true});assert.equal(f.button().props.disabled,true);f.gesture();assert.equal(f.calls.length,0);
});

test('close clears private drafts, aborts local wait and ignores late success after reopen',async()=>{
  const f=fixture();f.render();f.open();f.gesture();f.render();
  f.close();assert.equal(f.calls[0].args[2].signal.aborted,true);
  f.open();assert.equal(f.field().props.value,'');assert.equal(f.find(n=>n.type==='textarea').props.value,'');
  f.change(privateUrl);f.gesture();f.render();
  f.calls[0].resolve('STALE PRIVATE');await flush();f.render();assert.deepEqual(f.parses,[]);
  assert.equal(f.render().props['data-read-status'],'reading');
  f.calls[1].resolve('new input');await flush();f.render();assert.deepEqual(f.parses,['new input']);
});

test('a consumed editor URL remains only in the open reader until it is closed',()=>{
  const f=fixture(), consumed=[];
  f.render({onInitialUrlUsed:(sourceId,url)=>consumed.push({sourceId,url})});
  assert.deepEqual(consumed,[{sourceId:'sub',url:privateUrl}]);
  f.render({initialUrl:''});
  f.open();
  assert.equal(f.field().props.value,privateUrl);
  f.close();
  f.open();
  assert.equal(f.field().props.value,'');
  f.render({initialUrl:privateUrl});
  assert.equal(f.field().props.value,privateUrl,'an explicit new edit can pass the same address again');
});

test('URL replacement and unmount invalidate generations and stop late failures/results',async()=>{
  const f=fixture();f.render();f.open();f.gesture();f.render();
  f.render({initialUrl:'https://provider.example.com/replacement'});
  assert.equal(f.calls[0].args[2].signal.aborted,true);
  f.calls[0].reject(new Error(privateUrl));await flush();f.render();
  assert.equal(f.find(n=>n.props.role==='alert'),undefined);
  f.gesture();f.unmount();assert.equal(f.calls[1].args[2].signal.aborted,true);
  f.calls[1].resolve('STALE PRIVATE');await flush();assert.deepEqual(f.parses,[]);
});

test('reader shows only fixed errors and distinguishes cancelled from timeout',async()=>{
  for(const [error,key] of [[new downloads.SubscriptionDownloadError('cancelled'),'subscriptionDownloadCancelled'],
    [new downloads.SubscriptionDownloadError('timeout'),'subscriptionDownloadTimeout'],[new Error(privateUrl),'subscriptionDownloadFailed']]){
    const f=fixture();f.render();f.open();f.gesture();f.calls[0].reject(error);await flush();f.render();
    assert.equal(f.find(n=>n.props.role==='alert').props.children,key);assert.equal(f.actions.length,0);
  }
});
