import test from 'node:test';
import assert from 'node:assert/strict';
import {createFingerprintDriver} from '../../../../src/platform/chrome/browser-fingerprint.js';
import {normalizeBrowserOperation,BROWSER_OPERATIONS} from '../../../../src/framework/sdk/browser-contract.js';
import {checkedVerification} from '../src/env-config.js';
import {classifyRestoration} from '../src/run-session.js';
const tabRef='A'.repeat(32),documentRef='B'.repeat(32),sessionRef='C'.repeat(32);
const target=Object.freeze({tabId:71,windowId:2,documentId:'native-document-71',url:'https://example.com/qa'});
const ua='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36';
const us=Object.freeze({ua:'windows',lang:'en-US',tz:'America/New_York',geo:'off',viewport:'desktop'});
const jp=Object.freeze({ua:'mac',lang:'ja-JP',tz:'Asia/Tokyo',geo:'off',viewport:'mobile'});
const owner=Object.freeze({toolId:'browser-fingerprint',toolVersion:'0.2.2',
  packageHash:'a'.repeat(64),epoch:'install-epoch',hostInstanceId:'a'.repeat(36),toolInstance:'b'.repeat(36)});
const fail=code=>Object.assign(new Error(code),{code});
function harness({deny=false,failedCommand=null,noHints=false,detachFails=false,
  reverseViewportKeys=false}={}){
  const original={ua,language:'ja-JP',tz:'Asia/Tokyo',
    viewport:{width:1200,height:700},hints:'macOS'};
  let state=structuredClone(original),attached=false,allowed=!deny;
  const commands=[],listeners=[];
  const api={
    debugger:{
      onDetach:{addListener:handler=>listeners.push(handler)},
      async attach({tabId},version){
        assert.equal(tabId,71);assert.equal(version,'1.3');
        commands.push('attach');attached=true;
      },
      async sendCommand({tabId},method,args){
        assert.equal(tabId,71);assert.equal(attached,true);
        commands.push(method);
        if(failedCommand===method)throw fail('E_CDP_REJECTED');
        if(method==='Emulation.setUserAgentOverride'){
          state.ua=args.userAgent;
          if(args.acceptLanguage)state.language=args.acceptLanguage;
          if(args.userAgentMetadata)state.hints=args.userAgentMetadata.platform;
        }
        if(method==='Emulation.setTimezoneOverride')state.tz=args.timezoneId;
        if(method==='Emulation.setDeviceMetricsOverride')
          state.viewport={width:args.width,height:args.height};
      },
      async detach(){
        commands.push('detach');
        if(detachFails)throw fail('E_CDP_DETACH');
        state=structuredClone(original);attached=false;
      }
    },
    scripting:{executeScript:async()=>[{frameId:0,documentId:target.documentId,
      result:noHints?null:{platform:state.hints,brands:[{brand:'Chromium',version:'158'}]}}]}
  };
  const driver=createFingerprintDriver({api,newRef:()=>sessionRef,
    resolveTarget:async()=>target,
    authorize:async()=>{if(!allowed)throw fail('E_SITE_GRANT_REQUIRED');},
    readPage:async()=>({tabRef,documentRef,fields:{
      userAgent:{status:'available',value:state.ua},
      languages:{status:'available',value:[state.language]},
      timeZone:{status:'available',value:state.tz},
      viewport:{status:'available',value:reverseViewportKeys?
        {height:state.viewport.height,width:state.viewport.width}:state.viewport},
      screen:{status:'available',value:{width:1920,height:1080}},
      devicePixelRatio:{status:'available',value:1}
    }})
  });
  return {driver,api,commands,get state(){return state;},get attached(){return attached;},
    setAuthorized:value=>{allowed=value;},detachExternally:reason=>{
      for(const listener of listeners)listener({tabId:71},reason);
    }};
}
const refs={tabRef,documentRef};
test('R2.2 fixed SDK methods are registered and reject caller-supplied CDP/tabId',()=>{
  assert.equal(BROWSER_OPERATIONS['browser.fingerprint.apply'].riskLevel,'high');
  const args=normalizeBrowserOperation('browser.fingerprint.apply',{...refs,config:us});
  assert.deepEqual(args.config,us);
  assert.throws(()=>normalizeBrowserOperation('browser.fingerprint.apply',
    {...refs,config:us,tabId:71}),{code:'E_SCHEMA'});
  assert.throws(()=>normalizeBrowserOperation('browser.fingerprint.apply',
    {...refs,config:{...us,cdp:'Runtime.evaluate'}}),{code:'E_SCHEMA'});
  assert.throws(()=>normalizeBrowserOperation('browser.fingerprint.restore',
    {sessionRef,documentRef,method:'Page.navigate'}),{code:'E_SCHEMA'});
});
test('R2.2 apply -> independent page readback -> detach -> independent baseline readback',async()=>{
  const h=harness();
  const ack=await h.driver.apply({...refs,config:us},owner);
  assert.equal(ack.accepted,true);
  assert.equal(ack.source,'trusted-browser-host');
  assert.equal(ack.sessionRef,sessionRef);
  assert.equal(h.attached,true);
  assert.deepEqual(h.commands,['attach','Emulation.setUserAgentOverride',
    'Emulation.setLocaleOverride','Emulation.setTimezoneOverride',
    'Emulation.setDeviceMetricsOverride']);
  assert.ok(ack.controlledKeys.includes('acceptLanguage'));
  const read=await h.driver.readback({sessionRef,documentRef,mode:'applied'},owner);
  for(const key of ['ua','uaCH','language','timezone','viewport'])
    assert.equal(read.rows.find(row=>row.key===key)?.status,'match',key);
  for(const key of ['acceptLanguage','geolocation','publicIp'])
    assert.equal(read.rows.find(row=>row.key===key)?.status,'unverifiable',key);
  assert.notEqual(read.rows.find(row=>row.key==='ua').baseline,
    read.rows.find(row=>row.key==='ua').observed);
  const validated=checkedVerification(us,read,{sessionRef,documentRef});
  assert.equal(validated.find(row=>row.key==='ua').status,'match');
  assert.ok(validated.find(row=>row.key==='ua').baseline);
  assert.equal((await h.driver.restore({sessionRef,documentRef},owner)).accepted,true);
  assert.equal(h.attached,false);
  const restored=await h.driver.readback({sessionRef,documentRef,mode:'restore'},owner);
  for(const key of ['ua','uaCH','language','timezone','viewport'])
    assert.equal(restored.rows.find(row=>row.key===key)?.status,'match',key);
  assert.equal(restored.rows.find(row=>row.key==='acceptLanguage').status,'unverifiable');
  assert.equal(h.commands.at(-1),'detach');
});
test('R2.3 independently observed viewport ignores only property enumeration order',async()=>{
  const h=harness({reverseViewportKeys:true});
  const ack=await h.driver.apply({...refs,config:us},owner);
  assert.equal(ack.fieldResults.find(row=>row.key==='viewport').status,'applied');
  const applied=await h.driver.readback({sessionRef,documentRef,mode:'applied'},owner);
  const viewport=applied.rows.find(row=>row.key==='viewport');
  assert.equal(viewport.status,'match');
  assert.equal(viewport.expected,viewport.observed);
  await h.driver.restore({sessionRef,documentRef},owner);
  const restored=await h.driver.readback({sessionRef,documentRef,mode:'restore'},owner);
  assert.equal(restored.rows.find(row=>row.key==='viewport').status,'match');
});
test('R2.2 missing site grant prevents debugger attach',async()=>{
  const h=harness({deny:true});
  await assert.rejects(h.driver.apply({...refs,config:us},owner),{code:'E_SITE_GRANT_REQUIRED'});
  assert.deepEqual(h.commands,[]);
});
test('R2.2 changed tool instance cannot read or restore owned session',async()=>{
  const h=harness();
  await h.driver.apply({...refs,config:us},owner);
  const other={...owner,toolInstance:'f'.repeat(36)};
  await assert.rejects(h.driver.readback({sessionRef,documentRef,mode:'applied'},other),{code:'E_OWNER'});
  await assert.rejects(h.driver.restore({sessionRef,documentRef},other),{code:'E_OWNER'});
  await h.driver.restore({sessionRef,documentRef},owner);
});
test('R2.2 DevTools takeover invalidates original session, no side-effect retry',async()=>{
  const h=harness();
  await h.driver.apply({...refs,config:us},owner);
  const previous=h.commands.length;
  h.detachExternally('replaced_with_devtools');
  await assert.rejects(h.driver.readback({sessionRef,documentRef,mode:'applied'},owner),
    {code:'E_TARGET_INVALIDATED'});
  assert.equal(h.commands.length,previous);
});
test('R2.2 tab navigation retires only the original native debugger',async()=>{
  const h=harness();
  await h.driver.apply({...refs,config:jp},owner);
  h.driver.invalidateTab(target.tabId);
  assert.equal(h.commands.at(-1),'detach');
  await assert.rejects(h.driver.restore({sessionRef,documentRef},owner),
    {code:'E_TARGET_INVALIDATED'});
});
test('R2.2 CDP failure is recorded as unknown, not full native success',async()=>{
  const h=harness({failedCommand:'Emulation.setTimezoneOverride'});
  const ack=await h.driver.apply({...refs,config:us},owner);
  assert.equal(ack.fieldResults.find(x=>x.key==='timezone').status,'unknown');
  assert.ok(ack.fieldResults.find(x=>x.key==='ua').status==='applied');
  await h.driver.restore({sessionRef,documentRef},owner);
});
test('R2.2 restore detach failure is not reported as restored',async()=>{
  const h=harness({detachFails:true});
  await h.driver.apply({...refs,config:us},owner);
  await assert.rejects(h.driver.restore({sessionRef,documentRef},owner),{code:'E_OUTCOME_UNKNOWN'});
  await assert.rejects(h.driver.readback({sessionRef,documentRef,mode:'applied'},owner),
    {code:'E_CONTEXT'});
});
test('R2.2 UA Client Hints unavailable stays unverifiable even if UA matches',async()=>{
  const h=harness({noHints:true});
  await h.driver.apply({...refs,config:us},owner);
  const result=await h.driver.readback({sessionRef,documentRef,mode:'applied'},owner);
  assert.equal(result.rows.find(row=>row.key==='ua').status,'match');
  assert.equal(result.rows.find(row=>row.key==='uaCH').status,'unverifiable');
  await h.driver.restore({sessionRef,documentRef},owner);
});

test('R2.2 only independently matched fields permit verified restoration',()=>{
  const rows=['ua','uaCH','language','timezone','viewport'].map(key=>({key,status:'match'}));
  const controlledKeys=['ua','uaCH','language','acceptLanguage','timezone','viewport'];
  const limited={controlledKeys,rows:[...rows,{key:'acceptLanguage',status:'unverifiable'}]};
  assert.equal(classifyRestoration(limited),'restored_limited');
  assert.equal(classifyRestoration({...limited,rows:[...rows,{key:'acceptLanguage',status:'match'}]}),
    'restored_verified');
  assert.equal(classifyRestoration({...limited,rows:rows.map(x=>({...x,status:'mismatch'}))}),
    'restore_unknown');
  assert.equal(classifyRestoration({controlledKeys:[],rows:[]}), 'restore_unknown');
});
