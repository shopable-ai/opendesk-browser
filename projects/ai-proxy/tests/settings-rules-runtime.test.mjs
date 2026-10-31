import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build,transform} from 'esbuild';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import {runInNewContext} from 'node:vm';

async function bundle(path){
  const result=await build({entryPoints:[new URL(path,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const domain=await bundle('../src/domain/config.ts'),routes=await bundle('../src/ui/optionsRoute.ts');
const {translate}=await bundle('../src/i18n/locale.ts');
const {code}=await transform(await readFile(new URL('../src/Settings.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'});
const existing={id:'keep-id',domain:'existing.example',includeSubdomains:false,priority:42,enabled:false,action:'direct'};
function fixture({locale='en'}={}){
  const values=[],refs=[],effects=[],drafts=new Map(),calls=[],focus=[],scroll=[],frames=[];
  let cursor=0,refCursor=0,effectCursor=0,tree,confirmResult=true,saveResult=true,revision=0,operationBusy=false;
  const config={...domain.freshConfig(),rules:[{...existing}],endpoints:[{id:'proxy',name:'Proxy',scheme:'https',host:'proxy.example',port:443}]};
  const state={config,runtime:{control:'unknown',pendingChanges:true}};
  const scroller={scrollTop:320,scrollTo(value){this.scrollTop=value.top;scroll.push(value.top);}};
  const nodes=new Map();
  const node=id=>nodes.get(id)||(()=>{const value={id,isConnected:true,focus(){focus.push(id);},scrollIntoView(){scroll.push(id);}};nodes.set(id,value);return value;})();
  const env={navigation:{getRoute:()=>'#/rules',subscribe:()=>()=>{}},navigate(){},
    isDraftDirty:key=>drafts.has(key),getDraftRevision:key=>drafts.get(key)??0,
    setDraftDirty(value,key,expected){if(value)drafts.set(key,++revision);else{if(expected!==undefined&&expected!==(drafts.get(key)??0))return false;drafts.delete(key);}return true;},
    async confirm(message){calls.push({confirm:message});return typeof confirmResult==='function'?confirmResult():confirmResult;}};
  const hooks={...React,useState(initial){const index=cursor++;if(!(index in values))values[index]=typeof initial==='function'?initial():initial;
    return [values[index],next=>{values[index]=typeof next==='function'?next(values[index]):next;}];},
    useRef(initial){const index=refCursor++;return refs[index]??=( {current:initial} );},
    useEffect(fn,deps){const index=effectCursor++,previous=effects[index];if(!previous||deps.some((v,i)=>v!==previous.deps[i]))effects[index]={fn,deps,pending:true};}};
  const Button=({children,variant,...props})=>React.createElement('button',{type:'button',...props},children);
  const module={exports:{}};
  runInNewContext(code,{module,exports:module.exports,crypto:{randomUUID:()=>'new-id'},document:{getElementById:id=>node(id)},
    requestAnimationFrame:fn=>frames.push(fn),require(name){
      if(name==='react')return hooks;if(name==='react/jsx-runtime')return jsx;
      if(name==='@opendesk/ui')return {Button};
      if(name==='./environment')return {getEnvironment:()=>env};
      if(name==='./i18n/LocaleProvider')return {useI18n:()=>({t:(key,params)=>['ruleCount','apRuleEnabled','apRuleDisabled'].includes(key)?translate(locale,key,params):key,locale})};
      if(name==='./ui/useProxy')return {useProxy:()=>({state,busy:operationBusy,error:'',setError(){},setErrorKey:key=>calls.push({error:key}),refresh(){},
        act:async message=>{operationBusy=true;try{calls.push(JSON.parse(JSON.stringify(message)));const result=typeof saveResult==='function'?await saveResult():saveResult;
          if(result&&message.type==='SAVE_RULE'){config.rules=config.rules.filter(r=>r.id!==message.rule.id).concat(message.rule);}return result;}finally{operationBusy=false;}}})};
      if(name==='./domain/config')return domain;if(name==='./ui/optionsRoute')return routes;
      if(name==='./ui/FormField')return {FormField:({id,label,children})=>React.createElement('label',null,label,children({id}))};
      if(name==='./ui/ProxyEntry')return {ClearableInput:({onValueChange,fieldLabel,...props})=>React.createElement('input',{...props,onChange:e=>onValueChange(e.target.value)})};
      if(name==='./ui/OptionsShell')return {OptionsPageHeader:({title,actions})=>React.createElement('header',null,React.createElement('h2',null,title),actions)};
      return new Proxy({},{get:()=>()=>null});
    }});
  function expand(element){
    if(element==null||typeof element!=='object')return element;
    if(Array.isArray(element))return element.map(expand);
    if(typeof element.type==='function')return expand(element.type(element.props));
    if(typeof element.type==='symbol')return expand(element.props.children);
    const result={type:element.type,props:element.props,children:expand(element.props.children)};
    if(element.props.ref&&typeof element.props.ref==='object')element.props.ref.current={...node(element.props.id||element.props.className),closest:()=>scroller,querySelector:()=>null};
    return result;
  }
  function render(){cursor=refCursor=effectCursor=0;tree=expand(module.exports.default());
    for(const effect of effects)if(effect?.pending){effect.pending=false;effect.fn();}
    for(const fn of frames.splice(0))fn();return tree;}
  function all(predicate,value){if(arguments.length===1)value=tree;if(Array.isArray(value))return value.flatMap(v=>all(predicate,v));if(!value||typeof value!=='object')return [];
    return [...(predicate(value)?[value]:[]),...(value.children===undefined?[]:all(predicate,value.children))];}
  const text=value=>Array.isArray(value)?value.map(text).join(''):value&&typeof value==='object'?text(value.children):String(value??'');
  const button=label=>{const found=all(n=>n.type==='button'&&text(n)===label)[0];assert.ok(found,'button '+label);return found;};
  async function click(label){await button(label).props.onClick();render();}
  function change(id,value){const input=all(n=>n.props.id===id)[0];assert.ok(input,'field '+id);env.setDraftDirty(true,'settings-rule');input.props.onChange({target:{value,checked:value}});render();}
  render();render();
  return {config,env,calls,focus,scroll,render,all,text,button,click,change,
    setConfirm:value=>{confirmResult=value;},setSave:value=>{saveResult=value;},
    async submit(){await all(n=>n.type==='form'&&n.props.className==='ruleEditorForm')[0].props.onSubmit({preventDefault(){}});render();},
    hasEditor:()=>all(n=>n.props.id==='rule-domain').length>0};
}

test('settings rules list opens a separate editor; cancellation confirms only its draft and restores Add focus/scroll',async()=>{
  const f=fixture();assert.equal(f.hasEditor(),false);
  assert.equal(f.all(n=>n.type==='h2'&&f.text(n)==='websiteRules2').length,1);
  assert.ok(f.all(n=>n.props.id==='default-action').length);
  await f.click('addRule');assert.equal(f.hasEditor(),true);
  assert.equal(f.all(n=>n.props.className==='rulesList').length,0);
  f.env.setDraftDirty(true,'settings-default');f.change('rule-domain','draft.example');
  f.setConfirm(false);await f.click('cancel');assert.equal(f.hasEditor(),true);
  f.setConfirm(true);await f.click('cancel');assert.equal(f.hasEditor(),false);
  assert.equal(f.env.isDraftDirty('settings-rule'),false);assert.equal(f.env.isDraftDirty('settings-default'),true);
  assert.equal(f.focus.at(-1),'settings-rule-add');assert.ok(f.scroll.includes(320));
  assert.equal(f.calls.some(c=>c.type),false);
});

test('settings rule edit/save retains identity, disabled state and priority; success returns receipt and never applies',async()=>{
  const f=fixture();await f.click('edit');f.change('rule-domain','changed.example');
  await f.submit();assert.equal(f.hasEditor(),false);
  assert.deepEqual(f.calls.filter(c=>c.type),[{type:'SAVE_RULE',rule:{...existing,domain:'changed.example'}}]);
  assert.ok(f.all(n=>n.props.role==='status'&&f.text(n)==='r86Saved').length);
  assert.equal(f.focus.at(-1),'settings-rule-keep-id');
  assert.equal(f.env.isDraftDirty('settings-rule'),false);
});

test('settings rule failed save and background refresh preserve draft; Escape uses confirmation',async()=>{
  const f=fixture();await f.click('addRule');f.change('rule-domain','draft.example');
  f.config.endpoints=[];f.render();assert.equal(f.all(n=>n.props.id==='rule-domain')[0].props.value,'draft.example');
  f.setSave(false);await f.submit();assert.equal(f.hasEditor(),true);assert.equal(f.env.isDraftDirty('settings-rule'),true);
  f.setConfirm(false);const region=f.all(n=>typeof n.props.onKeyDown==='function')[0];assert.ok(region);
  await region.props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){}});await new Promise(setImmediate);f.render();assert.equal(f.hasEditor(),true);
  f.setConfirm(true);await region.props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){}});await new Promise(setImmediate);f.render();assert.equal(f.hasEditor(),false);
});

test('settings rule late save or discard confirmation cannot clear a newer draft revision',async()=>{
  for(const operation of ['save','cancel']){
    const f=fixture();await f.click('addRule');f.change('rule-domain','first.example');
    let resolve;const pending=new Promise(r=>{resolve=r;});
    if(operation==='save')f.setSave(()=>pending);else f.setConfirm(()=>pending);
    const work=operation==='save'?f.submit():f.click('cancel');
    f.change('rule-domain','newer.example');resolve(true);await work;f.render();
    assert.equal(f.hasEditor(),true);assert.equal(f.all(n=>n.props.id==='rule-domain')[0].props.value,'newer.example');
    assert.equal(f.env.isDraftDirty('settings-rule'),true);
  }
});

test('settings new rule normalizes domain, saves one enabled target and returns to its list record',async()=>{
  const f=fixture();await f.click('addRule');f.change('rule-domain','https://new.example/path');
  f.change('rule-priority','73');await f.submit();
  assert.equal(f.hasEditor(),false);
  assert.deepEqual(f.calls.filter(c=>c.type),[{type:'SAVE_RULE',rule:{id:'new-id',domain:'new.example',
    includeSubdomains:true,priority:73,enabled:true,action:'endpoint',endpointId:'proxy'}}]);
  assert.equal(f.focus.at(-1),'settings-rule-new-id');
  assert.equal(f.env.isDraftDirty('settings-rule'),false);
});

test('settings keeps seven discoverable sections and places copy/refresh in details without a second panel return',()=>{
  const f=fixture();
  assert.equal(f.all(n=>n.type==='option'&&['profiles','rules','subscriptions','backup','diagnostic','general','official'].includes(n.props.value)).length,7);
  assert.ok(f.all(n=>n.type==='label'&&n.props.htmlFor==='settings-section'&&f.text(n)==='settingsSections').length);
  const more=f.all(n=>n.type==='details'&&n.props.className==='settingsMore')[0];assert.ok(more);
  assert.ok(f.all(n=>n.type==='button'&&f.text(n)==='copyPageLink',more).length);
  assert.ok(f.all(n=>n.type==='button'&&f.text(n)==='refreshStatus',more).length);
  assert.equal(f.all(n=>n.type==='button'&&n.props.className==='proxy-back').length,0);
});

test('settings rule endpoint choice stays untouched when refreshed endpoints arrive during editing',async()=>{
  const f=fixture();await f.click('addRule');f.change('rule-domain','draft.example');f.change('rule-endpoint','');
  f.config.endpoints=[{id:'new-proxy',name:'New proxy',scheme:'https',host:'new.example',port:443}];
  f.render();f.render();
  assert.equal(f.all(n=>n.props.id==='rule-endpoint')[0].props.value,'');
  await f.submit();assert.equal(f.hasEditor(),true);
  assert.equal(f.calls.some(c=>c.error==='ruleChooseProxyFirst'),true);
  assert.equal(f.calls.some(c=>c.type),false);
});

test('settings default route remains independently saveable without applying or clearing another draft',async()=>{
  const f=fixture();f.env.setDraftDirty(true,'settings-default');f.env.setDraftDirty(true,'settings-backup');
  await f.click('saveDefaultRoute');
  assert.deepEqual(f.calls.filter(c=>c.type),[{type:'SET_DEFAULT',target:{action:'direct'}}]);
  assert.equal(f.env.isDraftDirty('settings-default'),false);
  assert.equal(f.env.isDraftDirty('settings-backup'),true);
});

test('settings section selector stays locked until an unfinished save settles',async()=>{
  const f=fixture();await f.click('addRule');f.change('rule-domain','pending.example');
  let settle;f.setSave(()=>new Promise(resolve=>{settle=resolve;}));
  const work=f.submit();f.render();
  assert.equal(f.all(n=>n.props.id==='settings-section')[0].props.disabled,true);
  settle(true);await work;
  assert.equal(f.all(n=>n.props.id==='settings-section')[0].props.disabled,false);
});


test('settings rule total is a separate translated badge including disabled saved rules in all three locales',()=>{
  for(const [locale,label] of [['zh-CN','2 条网站规则'],['en','2 website rules'],['zh-TW','2 條網站規則']]){
    const f=fixture({locale});
    f.config.rules.push({...existing,id:'second',domain:'second.example',enabled:true});f.render();
    assert.equal(f.all(n=>n.type==='span'&&n.props.className==='subtleTag'&&f.text(n)===label).length,1);
    assert.equal(f.all(n=>n.type==='p'&&n.props.className==='hint'&&f.text(n)==='apRuleSaveNote').length,1);
    assert.equal(f.calls.some(c=>c.type),false);
  }
});

test('settings rule target cards drive the matching preview and save only the selected target',async()=>{
  const f=fixture();await f.click('addRule');
  const choices=f.all(n=>n.type==='fieldset'&&n.props.className==='ruleTargetChoices')[0];assert.ok(choices);
  assert.equal(f.all(n=>n.type==='input'&&n.props.type==='radio',choices).length,2);
  assert.equal(f.all(n=>n.props.className==='ruleMatchPreview').length,0);
  f.change('rule-domain','https://preview.example/path');
  let preview=f.all(n=>n.props.className==='ruleMatchPreview')[0];assert.ok(preview);
  assert.match(f.text(preview),/preview\.example/);assert.match(f.text(preview),/Proxy/);
  f.change('rule-target-direct','direct');f.change('rule-subdomains',false);
  assert.equal(f.all(n=>n.props.id==='rule-endpoint').length,0);
  preview=f.all(n=>n.props.className==='ruleMatchPreview')[0];assert.match(f.text(preview),/directConnection2/);
  assert.doesNotMatch(f.text(preview),/subdomains/);
  assert.equal(f.all(n=>n.type==='p'&&f.text(n)==='apRuleSaveNote').length,1);
  assert.equal(f.all(n=>n.type==='p'&&f.text(n)==='ruleSaveDoesNotApply').length,0);
  assert.equal(f.all(n=>n.type==='summary'&&f.text(n)==='apRulePriorityOptions').length,1);
  await f.submit();assert.equal(f.hasEditor(),false);
  const saved=f.calls.find(c=>c.type==='SAVE_RULE').rule;
  assert.equal(saved.action,'direct');assert.equal(saved.includeSubdomains,false);assert.equal('endpointId' in saved,false);
});


test('settings rule list explains save-only semantics and labels enabled and disabled records in all locales',()=>{
  for(const locale of ['en','zh-CN','zh-TW']){
    const f=fixture({locale});
    f.config.rules.push({...existing,id:'enabled-rule',domain:'enabled.example',enabled:true});f.render();
    const records=f.all(n=>n.type==='article'&&n.props.className==='record');
    assert.equal(records.length,2);
    assert.equal(f.all(n=>n.props.className==='rulesEnabledState'&&f.text(n)===translate(locale,'apRuleDisabled'),records[0]).length,1);
    assert.equal(f.all(n=>n.props.className==='rulesEnabledState'&&f.text(n)===translate(locale,'apRuleEnabled'),records[1]).length,1);
    assert.equal(f.all(n=>n.type==='p'&&f.text(n)==='apRuleSaveNote').length,1);
    assert.equal(f.all(n=>n.type==='p'&&f.text(n)==='ruleEditorIntro').length,0);
    assert.equal(f.hasEditor(),false);
    assert.ok(f.all(n=>n.props.id==='default-action').length);
    assert.equal(f.calls.some(c=>c.type),false);
  }
});
