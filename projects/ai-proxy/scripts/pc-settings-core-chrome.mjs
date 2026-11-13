// Called by sidebar-core-chrome's pc phase, after real installation/mount.
// One owned PC target, 1440/light only. No storage writes, SDK mocks or APPLY.
import assert from 'node:assert/strict';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

export async function auditPCSettings(ctx) {
 const {out,worker,extensionId,attach,ev,call,until,click,fill,key,choose,screenshot,native}=ctx;
 const result={status:'RUNNING',checks:[],scenes:[],boundaries:[],network:{status:'NOT_TESTED',requests:[],reason:'ctx.call is request/response only; parent must subscribe to Network.requestWillBeSent before this audit. Record only method, resource type and URL scheme/hostname; never path, query, headers or body. Cover worker traffic too; PC events alone cannot prove background silence.'}};
 const save=()=>writeFile(join(out,'pc-settings-core.json'),JSON.stringify(result,null,2)+'\n');
 const check=(name,value)=>{result.checks.push({name,status:value?'PASS':'FAIL'});assert(value,name);};
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const baseline=await native();
 // native() may include PAC text: report a digest, never the script itself.
 result.nativeBaselineSha256=createHash('sha256').update(JSON.stringify(baseline)).digest('hex');
 let pc;
 const q=JSON.stringify;
 const read=expression=>ev(pc,expression);
 const wait=(expression,label)=>until(()=>read(expression),label);
 const value=selector=>read(`document.querySelector(${q(selector)})?.value`);
 const tap=selector=>click(pc,selector);
 const type=(selector,text)=>fill(selector,text,pc);
 const select=(selector,v)=>choose(selector,v,pc);
 const press=(name,extra={})=>key(name,name,{windowsVirtualKeyCode:name==='Escape'?27:9,...extra},pc);
 const exists=selector=>read(`!!document.querySelector(${q(selector)})?.getClientRects().length`);
 // Observe the current DOM before activating via the parent's focus+Enter helper.
 const button=async(scope,index=0)=>{
  const selector=`${scope} button${index===0?':first-of-type':`:nth-of-type(${index+1})`}`;
  await wait(`!!document.querySelector(${q(selector)})&&!document.querySelector(${q(selector)}).disabled`,'enabled '+selector);
  await tap(selector);
 };
 const confirm=async(accept)=>{
  await wait('[...document.querySelectorAll("[role=alertdialog]")].some(e=>e.getClientRects().length)','real confirmation');
  // Existing trusted confirmation labels are bilingual; never guess button order.
  const text=await read(`(()=>{const d=[...document.querySelectorAll('[role=alertdialog]')].find(e=>e.getClientRects().length);const b=[...d.querySelectorAll('button')].find(e=>${accept?'/^(确认|Confirm|確定|确认操作)$/':'/^(取消|Cancel)$/'}i.test(e.textContent.trim()));if(!b)throw Error('Unknown confirmation labels');return b.textContent.trim()})()`);
  assert(text,'observed confirmation action');
  await ctx.textButton(text,'[role=alertdialog]',pc);
  await wait('![...document.querySelectorAll("[role=alertdialog]")].some(e=>e.getClientRects().length)','confirmation settled');
 };
 const stableNative=async name=>check(name,same(await native(),baseline));
 const capture=async name=>{
  await stableNative(name+' leaves native proxy unchanged');
  await screenshot('pc-core-'+name,pc);
  result.scenes.push({name,screenshot:'pc-core-'+name+'.png',at:new Date().toISOString()});await save();
 };
 const section=async name=>{
  const sections=['profiles','rules','subscriptions','backup','diagnostic','general','official'];
  const index=sections.indexOf(name);
  await wait('document.querySelectorAll(".managementNav button").length===7','seven PC sections');
  await tap(`.managementNav button:nth-of-type(${index+1})`);
  await wait(`!!document.querySelector('.optionsContent--${name}')`,'section '+name);
 };
 const reopen=async name=>{
  const origin=await read('performance.timeOrigin');await call('Page.reload',{},pc);
  await wait(`performance.timeOrigin!==${origin}&&document.readyState==='complete'&&!!document.querySelector('.managementNav')`,'PC reopens');
  await section(name);
 };
 // Read only the installed tool namespace, never dump storage or seed data.
 const config=()=>ev(worker,`chrome.storage.local.get('opendesk.sidebar-tools.data.v1:ai-proxy').then(items=>{const c=items['opendesk.sidebar-tools.data.v1:ai-proxy']?.['ai-proxy.full-config.v2'];if(!c||!Array.isArray(c.endpoints)||!Array.isArray(c.rules))throw Error('Missing installed ai-proxy.full-config.v2');return c})`);
 const durable=async(predicate,label)=>until(async()=>{const c=await config();return predicate(c)&&c;},label);
 const ruleFields=async(domain,scope,route,priority,enabled=true)=>{
  await type('#rule-domain',domain);await select('#rule-scope',scope);await select('#rule-route',route);await type('#rule-priority',String(priority));
  if(await read('document.querySelector("#rule-enabled").checked')!==enabled)await tap('#rule-enabled');
 };
 const addRule=async(domain,scope,route,priority,enabled=true)=>{
  await tap('#settings-rule-add');await wait('!!document.querySelector(".ruleEditorDialog[open]")','PC rule dialog');
  await ruleFields(domain,scope,route,priority,enabled);if(scope==='subdomains')await screenshot('pc-core-rule-editor',pc);await tap('.ruleEditorForm button[type=submit]');
  await wait('!document.querySelector(".ruleEditorDialog[open]")','rule saved');
  const c=await durable(c=>c.rules.some(r=>r.domain===domain&&r.includeSubdomains===(scope==='subdomains')&&r.priority===priority&&r.enabled===enabled&&r.action===(route==='direct'?'direct':'endpoint')&&(route==='direct'||r.endpointId===route)),'saved rule data');
  check('saves rule '+domain+' '+scope,true);return c.rules.find(r=>r.domain===domain&&r.includeSubdomains===(scope==='subdomains'));
 };
 const editSelector=r=>'#settings-rule-'+r.id;
 const toggleSelector=r=>`.ruleRecord:has([id=${q('settings-rule-'+r.id)}]) .ruleEnabledToggle`;
 const calculate=async(domain,target,matchedDomain=null,priority=null)=>{
  const requestCount=ctx.networkRequests.length;
  await type('#rule-test-domain',domain);await tap('.routeTester form button[type=submit]');
  await wait('!!document.querySelector(".ruleTestResult")','calculation result');
  check('calculator target '+domain,await read(`document.querySelector('.ruleTestResult strong').textContent.trim()===${q(target)}`));
  const detail=await read('document.querySelector(".ruleTestResult span").textContent');
  check('calculator echoes hostname '+domain,detail.includes(domain));
  if(matchedDomain)check('calculator matched rule '+domain,detail.startsWith(domain+' · '+matchedDomain+' · '));
  if(priority!==null)check('calculator priority '+domain,detail.trim().endsWith(' '+priority));
  if(!matchedDomain)check('calculator uses fallback '+domain,detail.split(' · ').length===2);
  await stableNative('calculation '+domain);
  check('calculator sends no page or worker HTTP requests '+domain,ctx.networkRequests.length===requestCount);
  result.network={status:'PASS',scope:'local route calculator, PC and extension worker',requests:[]};
 };
 const suffix=Date.now().toString(36),base=`pc-${suffix}.example.com`,name=`PC core ${suffix}`,edited=name+' edited';
 try {
  const {targetId}=await call('Target.createTarget',{url:`chrome-extension://${extensionId}/app.html?toolId=ai-proxy&view=settings&section=profiles`});
  result.targetId=targetId;pc=await attach(targetId);result.sessionId=pc;
  await call('Page.enable',{},pc);
  await call('Network.enable',{},pc);result.network.enabled=true;
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},pc);
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]},pc);
  await section('profiles');check('PC width is 1440',await read('innerWidth===1440'));
  check('PC light color preference',await read('matchMedia("(prefers-color-scheme: light)").matches'));
  await tap('.profilePanelHead .panelHeadActions .primary');await wait('!!document.querySelector(".proxyEditorDialog[open]")','profile editor');
  await type('#ep-name',name);await type('#ep-host','proxy.example.com');await type('#ep-port','8080');await select('#ep-scheme','http');
  await tap('.proxyEditorForm button[type=submit]');await wait('!document.querySelector(".proxyEditorDialog[open]")','profile saved');
  let c=await durable(c=>c.endpoints.some(e=>e.name===name),'profile persisted');
  const endpoint=c.endpoints.find(e=>e.name===name),endpointId=endpoint.id;
  check('new endpoint has saved port',endpoint.port===8080);
  await capture('profile-created');await reopen('profiles');await tap('#settings-proxy-'+endpointId);
  await wait('!!document.querySelector(".proxyEditorDialog[open]")','saved profile reopened');
  check('profile name reopens',await value('#ep-name')===name);check('profile host reopens',await value('#ep-host')==='proxy.example.com');
  await type('#ep-name',edited);await type('#ep-port','8081');await tap('.proxyEditorForm button[type=submit]');
  await wait('!document.querySelector(".proxyEditorDialog[open]")','profile edit saved');
  await durable(c=>c.endpoints.some(e=>e.id===endpointId&&e.name===edited&&e.port===8081),'profile edit persisted');
  await reopen('profiles');await tap('#settings-proxy-'+endpointId);await wait('!!document.querySelector(".proxyEditorDialog[open]")','profile edit reopened');
  check('profile edited name reopens',await value('#ep-name')===edited);check('profile edited port reopens',await value('#ep-port')==='8081');
  await press('Escape');await wait('!document.querySelector(".proxyEditorDialog[open]")','clean profile Escape');await capture('profile-edited-reopened');

  await section('rules');await tap('#settings-rule-add');await wait('!!document.querySelector(".ruleEditorDialog[open]")','rule add dialog');
  await wait('document.activeElement?.id==="rule-domain"','rule domain autofocus');check('rule domain receives initial focus',true);
  for(let i=0;i<16;i++){await press('Tab');check('rule dialog contains Tab '+i,await read('document.querySelector(".ruleEditorDialog[open]").contains(document.activeElement)'));}
  for(let i=0;i<12;i++){await press('Tab',{modifiers:8});check('rule dialog contains Shift Tab '+i,await read('document.querySelector(".ruleEditorDialog[open]").contains(document.activeElement)'));}
  await press('Escape');await wait('!document.querySelector(".ruleEditorDialog[open]")','clean rule Escape');
  await wait('document.activeElement?.id==="settings-rule-add"','rule focus restored');check('Escape restores rule add focus',true);
  const beforeCancel=(await config()).rules.length;
  await tap('#settings-rule-add');await type('#rule-domain',`cancel.${base}`);await button('.ruleEditorForm .actions',1);await confirm(false);
  check('cancel discard retains rule draft',await value('#rule-domain')===`cancel.${base}`);
  await press('Escape');await confirm(true);await wait('!document.querySelector(".ruleEditorDialog[open]")','dirty rule discarded');
  check('discard does not create rule',(await config()).rules.length===beforeCancel);await capture('rule-cancel-escape-focus');

  const broad=await addRule(base,'subdomains',endpointId,50);
  const exact=await addRule(`api.${base}`,'exact','direct',10);
  const disabled=await addRule(`off.${base}`,'exact','direct',5,false);
  await tap(editSelector(broad));await wait('!!document.querySelector(".ruleEditorDialog[open]")','edit broad rule');
  check('rule scope reopens',await value('#rule-scope')==='subdomains');check('rule endpoint reopens',await value('#rule-route')===endpointId);
  await type('#rule-priority','40');await tap('.ruleEditorForm button[type=submit]');await wait('!document.querySelector(".ruleEditorDialog[open]")','rule edit saved');
  await durable(c=>c.rules.some(r=>r.id===broad.id&&r.priority===40),'priority edit persisted');
  check('default route has exactly one selector',await read('document.querySelectorAll(".rulesDefault select").length===1'));
  const defaultBefore=(await config()).defaultTarget;await select('#default-route',endpointId);
  check('default selection alone does not persist',same((await config()).defaultTarget,defaultBefore));
  await tap('.rulesDefault .actions button');await durable(c=>c.defaultTarget.endpointId===endpointId,'explicit default saved');
  await reopen('rules');check('default route reopens',await value('#default-route')===endpointId);
  await tap(editSelector(broad));await wait('!!document.querySelector(".ruleEditorDialog[open]")','rule edit reopens');
  check('edited priority reopens',await value('#rule-priority')==='40');await press('Escape');await wait('!document.querySelector(".ruleEditorDialog[open]")','rule edit closes');
  const prioritySelector=`.ruleRecord:has([id=${q('settings-rule-'+broad.id)}]) .managementRulePriority`;
  await type(prioritySelector,'41');await press('Enter',{windowsVirtualKeyCode:13});
  await durable(c=>c.rules.some(r=>r.id===broad.id&&r.priority===41),'inline priority persisted');
  await type(prioritySelector,'40');await press('Enter',{windowsVirtualKeyCode:13});
  await durable(c=>c.rules.some(r=>r.id===broad.id&&r.priority===40),'inline priority restored');
  check('inline priority saves without applying',true);
  // Direct display text is localized; observe the actual saved editor option.
  await tap(editSelector(exact));await wait('!!document.querySelector(".ruleEditorDialog[open]")','exact rule reopens');
  const direct=await read('document.querySelector("#rule-route option[value=direct]").textContent.trim()');
  check('exact scope reopens',await value('#rule-scope')==='exact');await press('Escape');await wait('!document.querySelector(".ruleEditorDialog[open]")','exact editor closes');
  await calculate(`api.${base}`,direct,`api.${base}`,10);
  await calculate(`deep.api.${base}`,edited,base,40);
  await calculate(`off.${base}`,edited,base,40);
  await calculate(`unmatched-${suffix}.example.net`,edited);
  // Prove priority wins over apparent specificity, then restore the baseline.
  await tap(editSelector(broad));await wait('!!document.querySelector(".ruleEditorDialog[open]")','priority override editor');
  await type('#rule-priority','6');await tap('.ruleEditorForm button[type=submit]');await wait('!document.querySelector(".ruleEditorDialog[open]")','priority override saved');
  await durable(c=>c.rules.some(r=>r.id===broad.id&&r.priority===6),'priority override persisted');
  await calculate(`api.${base}`,edited,base,6);
  await tap(editSelector(broad));await wait('!!document.querySelector(".ruleEditorDialog[open]")','restore priority editor');
  await type('#rule-priority','40');await tap('.ruleEditorForm button[type=submit]');await wait('!document.querySelector(".ruleEditorDialog[open]")','priority restored');
  await durable(c=>c.rules.some(r=>r.id===broad.id&&r.priority===40),'priority restored persisted');
  await tap(toggleSelector(exact));await durable(c=>c.rules.some(r=>r.id===exact.id&&!r.enabled),'list toggle disabled persisted');
  await reopen('rules');check('list disabled state reopens',await read(`!document.querySelector(${q(toggleSelector(exact))}).checked`));
  await calculate(`api.${base}`,edited,base,40);
  await tap(toggleSelector(exact));await durable(c=>c.rules.some(r=>r.id===exact.id&&r.enabled),'list toggle enabled persisted');
  await reopen('rules');check('list enabled state reopens',await read(`document.querySelector(${q(toggleSelector(exact))}).checked`));
  await calculate(`api.${base}`,direct,`api.${base}`,10);
  await tap(editSelector(disabled));await wait('!!document.querySelector(".ruleEditorDialog[open]")','disabled editor');
  check('disabled editor checkbox reopens unchecked',await read('!document.querySelector("#rule-enabled").checked'));await press('Escape');await wait('!document.querySelector(".ruleEditorDialog[open]")','disabled editor closed');
  await capture('rules-multiple-priority-default-toggle');

  await section('subscriptions');await tap('.subscriptionIndexHead button.primary');await wait('!!document.querySelector("#r72-sub-name")','subscription form');
  await type('#r72-sub-name',name+' source');await type('#r72-sub-url','https://provider.example.com/');await select('#r72-sub-format','uri-list');
  await ctx.textButton(await read('document.querySelector(".sourceForm button[type=submit]").textContent.trim()'),'.sourceForm',pc);await confirm(true);await wait('!!document.querySelector(".subscriptionDetailCard")','source detail');
  c=await durable(c=>c.sources.some(s=>s.displayName===name+' source'),'source saved');const source=c.sources.find(s=>s.displayName===name+' source');
  check('subscription saves domain only',source.originHost==='provider.example.com'&&!JSON.stringify(source).includes('https://'));
  await tap('.subscriptionReaderToolbar button');await type('.subscriptionReaderPanel textarea',`http://node.example.com:8082#PC-node-${suffix}`);
  await tap('.subscriptionReaderPanel form:first-of-type button[type=submit]');await wait('document.querySelector(".subscriptionReader")?.dataset.readStatus==="success"','text parsed');
  check('text parser exposes one node',await read('document.querySelectorAll(".subscriptionNodes .subscriptionNode").length===1'));
  await tap('.subscriptionNode button');c=await durable(c=>c.endpoints.some(e=>e.name===`PC-node-${suffix}`&&e.host==='node.example.com'&&e.port===8082)&&c.profiles.some(p=>p.endpointId===c.endpoints.find(e=>e.name===`PC-node-${suffix}`)?.id),'parsed node and profile saved');
  const node=c.endpoints.find(e=>e.name===`PC-node-${suffix}`);
  check('parsed node has profile',c.profiles.some(p=>p.endpointId===node.id));
  await press('Escape');await capture('subscription-parsed-node-saved');
  await section('subscriptions');await tap('#sources-tab-local');await tap('.subscriptionIndexHead button.primary');await wait('!!document.querySelector("#r72-local-name")','local form');
  await type('#r72-local-name',name+' local');await select('#r72-local-scheme','socks5');await type('#r72-local-port','17891');await tap('.sourceForm button[type=submit]');
  await wait('!document.querySelector("#source-editor")','local saved');c=await durable(c=>c.endpoints.some(e=>e.name===name+' local'&&e.port===17891),'local persisted');
  const local=c.endpoints.find(e=>e.name===name+' local');await reopen('profiles');await tap('#settings-proxy-'+local.id);await wait('!!document.querySelector("#r72-local-name")','local edit reopens');
  check('local name reopens',await value('#r72-local-name')===name+' local');check('local port reopens',await value('#r72-local-port')==='17891');check('local scheme reopens',await value('#r72-local-scheme')==='socks5');
  await press('Escape');await wait('!document.querySelector("#source-editor")','clean local editor closed');await capture('local-client-reopened');

  await section('backup');
  const downloadDir=join(out,'pc-core-downloads');await mkdir(downloadDir,{recursive:true});
  await call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir});
  const previousFiles=new Set(await readdir(downloadDir));await tap('.backupExport button');
  await wait('!!document.querySelector(".backupExport .backupSuccess[role=status]")','backup generated visible receipt');
  check('export shows generated receipt',await exists('.backupExport .backupSuccess[role=status]'));
  const downloaded=await until(async()=>{for(const file of await readdir(downloadDir)){if(previousFiles.has(file)||!/^ai-proxy-share-v2.*\.json$/.test(file))continue;try{const text=await readFile(join(downloadDir,file),'utf8');const data=JSON.parse(text);if(data.schemaVersion===2)return {file,text,data};}catch{/* download still in progress */}}},'actual backup download');
  check('export downloads schema v2',downloaded.data.schemaVersion===2);result.backup={file:join('pc-core-downloads',downloaded.file),sha256:createHash('sha256').update(downloaded.text).digest('hex')};
  const savedBefore=await config();await type('#import-data','{"schemaVersion":');await tap('.backupImport > button');
  await wait('!!document.querySelector(".optionsContent--backup [role=alert]")','invalid backup error');check('invalid backup opens no confirmation',!await exists('[role=alertdialog]'));
  check('invalid backup retains config',same(await config(),savedBefore));await capture('backup-invalid');
  await type('#import-data',downloaded.text);await tap('.backupImport > button');await confirm(false);
  check('cancel import retains config',same(await config(),savedBefore));check('cancel import retains input',await value('#import-data')===downloaded.text);await capture('backup-cancel');
  await tap('.backupImport > button');await confirm(true);await wait('!!document.querySelector(".backupImport .backupSuccess")','backup imported receipt');
  check('confirmed import clears draft',await value('#import-data')==='');await reopen('profiles');
  c=await config();check('import preserves edited endpoint',c.endpoints.some(e=>e.name===edited&&e.port===8081));check('import preserves multiple rules',c.rules.some(r=>r.domain===base)&&c.rules.some(r=>r.domain===`api.${base}`));
  await section('rules');check('imported default reopens',await value('#default-route')===endpointId);await capture('backup-import-reopened');

  await section('general');const originalLocale=await value('#ui-locale');const nextLocale=originalLocale==='en'?'zh-CN':'en';
  await select('#ui-locale',nextLocale);await reopen('general');check('language selection saves on change and reloads',await value('#ui-locale')===nextLocale);
  await select('#ui-locale',originalLocale);await reopen('general');check('original language restores through UI',await value('#ui-locale')===originalLocale);
  await wait('!!document.querySelector(".headerActionsChoices input:not(:disabled)")','header preferences ready');
  const headerBefore=await read('[...document.querySelectorAll(".headerActionsChoices input")].map(e=>e.checked)');
  await tap('.headerActionsChoices label:last-child input');const headerAfter=await read('[...document.querySelectorAll(".headerActionsChoices input")].map(e=>e.checked)');
  check('header checkbox edits draft',!same(headerBefore,headerAfter));await tap('.headerActionsEditor .actions button:first-child');
  await wait('!!document.querySelector(".headerActionsEditor [role=status]")','header saved receipt');await reopen('general');
  await wait('!!document.querySelector(".headerActionsChoices input:not(:disabled)")','header preferences reopened');
  check('header choices save and reopen',same(headerAfter,await read('[...document.querySelectorAll(".headerActionsChoices input")].map(e=>e.checked)')));await capture('general-header-language');

  await section('diagnostic');await tap('#diagnostic-tab-proxy');await wait('!!document.querySelector(".basicDiagnostic")','real proxy diagnostics');
  await tap('.basicDiagnostic .actions button:nth-child(2)');await wait('!document.querySelector(".basicDiagnostic .actions button:nth-child(2)").disabled','refresh completes');
  check('real diagnostic status visible',await read('document.querySelector(".basicDiagnostic .statusTop strong").textContent.trim().length>0'));
  const observedControl=await read('document.querySelector(".basicDiagnostic .status small[title]")?.title');
  check('diagnostic control agrees with Chrome API',observedControl===(await native()).level);
  check('network probe remains unavailable',await read('document.querySelector(".basicDiagnostic .actions button:first-child").disabled'));
  // STOP changes native state. Do not manufacture controlled state to cover it.
  result.boundaries.push({name:'diagnostic recovery',status:'NOT_TESTED',reason:'No authorized pre-existing controlled recovery fixture supplied; audit never applies or releases proxy ownership. Native baseline remains invariant.'});
  await capture('diagnostic-refresh');
  await section('subscriptions');await tap('.subscriptionOtherActions button');await wait('!!document.querySelector(".officialEmpty")||!!document.querySelector(".officialPage [role=alert]")','official boundary');
  check('official provider is unconfigured',await exists('.officialEmpty'));
  check('unconfigured official has no login or checkout',!await exists('.officialActions'));
  await tap('.subscriptionBreadcrumb button');await wait('!!document.querySelector(".subscriptionIndexPage")','official return to sources');check('official return restores source list',true);
  await section('official');await wait('!!document.querySelector(".officialEmpty")','official settings unconfigured');await capture('official-unconfigured-return');
  await stableNative('complete PC settings audit');result.status='PASS';
 }catch(error){result.status='FAIL';result.failure={message:error.message,stack:error.stack};if(pc)try{await screenshot('pc-core-failure',pc);}catch(e){result.screenshotFailure=e.message;}throw error;}
 finally {await save();}
 return result;
}
