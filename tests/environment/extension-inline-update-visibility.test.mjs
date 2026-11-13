import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {flushSync} from 'react-dom';
import {createExtensionCenterDOM} from '../helpers/extension-center-react-dom.mjs';
import {projectTrustedInlineUpdates} from '../../src/ui/extension-center-model.js';

const candidate=id=>({kind:'sidebar-tool',id,status:'available',version:'1.1.0',
  fromVersion:'1.0.0',source:'opendesk/'+id,sha256:'a'.repeat(64),requiresReview:true,
  newCapabilities:[],ignoredAt:null});
const entry=id=>({key:'app:'+id,id,title:id,kind:'app',installed:true,
  updateIdentity:(({id,fromVersion,version,source,sha256})=>({id,fromVersion,version,source,sha256}))(candidate(id))});
const rows=(records=[candidate('first'),candidate('second')],verified=true)=>
  projectTrustedInlineUpdates([entry('first'),entry('second')],{verified,records});
const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));flushSync(()=>{});};

test('update and More share the last focused row overlay without changing row geometry',async t=>{
  const {doc,adapter}=createExtensionCenterDOM(t);
  adapter.renderRows({rows:rows(),onOpenRow(){},onMore(){}});
  const css=await readFile(new URL('../../src/ui/extension-center.css',import.meta.url),'utf8');
  const check=active=>{
    // Actual component output + production stylesheet, not a string assertion.
    // DOM emulation proves the ordinary selector; real hit-testing is separate.
    const browser=new JSDOM(doc.documentElement.outerHTML);
    try{
      const style=browser.window.document.createElement('style');style.textContent=css;
      browser.window.document.head.append(style);
      for(const key of ['first','second']){
        const update=browser.window.document.querySelector(`[data-extension-key="app:${key}"][data-extension-action="update"]`);
        assert.ok(update);
        const style=browser.window.getComputedStyle(update.parentElement);
        assert.equal(style.opacity,key===active?'1':'0');
        assert.equal(style.pointerEvents,key===active?'auto':'none');
        assert.equal(style.top,'50%');
        assert.equal(style.transform,'translateY(-50%)');
        assert.equal(update.parentElement.querySelector('[data-extension-action="more"]').parentElement,update.parentElement);
      }
    }finally{browser.window.close();}
  };
  check('first');
  doc.querySelector('[data-extension-key="app:second"][data-extension-action="main"]').focus();
  await settle();
  check('second');
});

test('cancelled, rejected and failed reviews retain the entry; UNKNOWN disables it without replay',async t=>{
  const {doc,adapter}=createExtensionCenterDOM(t);
  let calls=0,finish;
  const model={rows:rows(),onOpenRow(){},onMore(){},onInlineUpdate(){
    calls++;return new Promise((resolve,reject)=>{finish={resolve,reject};});
  }};
  adapter.renderRows(model);
  const button=()=>doc.querySelector('[data-extension-key="app:second"][data-extension-action="update"]');
  for(const outcome of ['cancel','E_PERMISSION_DENIED','E_INSTALL_FAILED','E_OUTCOME_UNKNOWN']){
    const before=calls;
    button().dispatch('click');
    assert.equal(button().disabled,true,'pending review remains visible');
    button().dispatch('click');assert.equal(calls,before+1,'duplicate click cannot open another review');
    if(outcome==='cancel')finish.resolve(false);else finish.reject(Error(outcome));
    await settle();
    assert.ok(button());assert.equal(button().disabled,false);
    assert.match(doc.querySelector('.ec-update-error').textContent,/未开启|未确认/);
    adapter.renderRows({...model,rows:rows().filter(row=>row.id==='second')});
    assert.ok(button(),'search/filter rerender retains the matching entry');
    adapter.renderRows(model);
  }
  adapter.renderRows({...model,rows:rows([candidate('first'),{...candidate('second'),status:'unknown'}])});
  const before=calls;assert.ok(button());assert.equal(button().disabled,true);
  button().dispatch('click');assert.equal(calls,before,'unknown cannot retry an installation');
  adapter.renderRows({...model,rows:rows([candidate('first'),candidate('second')],false)});
  assert.equal(button().disabled,true,'unverified snapshots cannot open review');
  adapter.renderRows(model);assert.equal(button().disabled,false);
  adapter.renderRows({...model,rows:projectTrustedInlineUpdates([
    entry('first'),{...entry('second'),updateIdentity:null}
  ],{verified:true,records:[candidate('first'),{...candidate('second'),status:'applied'}]})});
  assert.equal(button(),null,'real completed identity readback removes the obsolete candidate');
});
