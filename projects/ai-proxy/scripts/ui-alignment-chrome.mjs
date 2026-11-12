// UI scenarios use sidebar-core-chrome's owned Chrome, installation and CDP driver.
// No SDK mock, storage seeding, route application or second browser framework.
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export async function auditUI(ctx){
 const {call,attach,ev,host,worker,extensionId,out,until,click,fill,key,choose,textButton,screenshot,native,referenceFile}=ctx;
 const result={status:'RUNNING',scenes:[],checks:[],reference:referenceFile||null,errors:[]};
 const save=()=>writeFile(join(out,'ui-audit.json'),JSON.stringify(result,null,2)+'\n');
 const check=(name,value)=>{assert(value,name);result.checks.push({name,status:'PASS'});};
 const viewport=(s,width)=>call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},s);
 const theme=(s,value)=>call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value}]},s);
 const reload=async s=>{
  const origin=await ev(s,'performance.timeOrigin');
  await call('Page.reload',{},s);
  await until(()=>ev(s,`performance.timeOrigin!==${origin}&&document.readyState==='complete'`),'new document loaded');
 };
 const ready=s=>until(()=>ev(s,'!!document.querySelector(".proxy-app .options .panelHeadActions .primary")'),'settings ready');
 const open=async s=>{await click(s,'.options .panelHeadActions .primary');await until(()=>ev(s,'!!document.querySelector(".proxyEditorDialog[open]")'),'proxy dialog');};
 const cancel=async s=>{await textButton('取消','.proxyEditorForm',s);await until(()=>ev(s,'!document.querySelector(".proxyEditorDialog[open]")'),'editor closed');};
 async function capture(s,name,width,color='light'){
  await viewport(s,width);await theme(s,color);await ev(s,'document.fonts.ready.then(()=>true)');
  await ev(s,`(()=>{if(document.querySelector('dialog[open],.modal--proxy'))return;document.activeElement?.blur();window.scrollTo(0,0);for(const e of document.querySelectorAll('.proxy-route,.r86Scroll,.proxy-app,.options,.optionsContent'))e.scrollTop=0;})()`);
  const dom=await ev(s,`(()=>{const app=document.querySelector('.proxy-app')||document.body;const modal=app.querySelector('dialog[open],.modal--proxy');const target=modal||app;const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};const style=e=>{const c=getComputedStyle(e);return Object.fromEntries(['display','gridTemplateColumns','gap','padding','fontSize','lineHeight','borderRadius','backgroundColor','color'].map(k=>[k,c[k]]))};return {url:location.href,viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>innerWidth,app:rect(app),modal:modal?{rect:rect(modal),style:style(modal)}:null,fields:[...target.querySelectorAll('label,input,select,button')].filter(e=>e.getClientRects().length).map(e=>({tag:e.tagName,id:e.id,type:e.type,text:e.matches('input,select')?undefined:e.textContent.trim(),aria:e.getAttribute('aria-label'),rect:rect(e),style:style(e)}))}})()`);
  assert.equal(dom.viewport[0],width);check(name+' no page overflow',!dom.overflow);
  if(dom.modal){check(name+' dialog inside viewport',dom.modal.rect.x>=0&&dom.modal.rect.x+dom.modal.rect.width<=width+1);const fields=Object.fromEntries(dom.fields.filter(e=>/^ep-/.test(e.id)).map(e=>[e.id,e.rect]));
   if(fields['ep-name']){check(name+' three rows',fields['ep-name'].y<fields['ep-scheme'].y&&fields['ep-scheme'].y===fields['ep-host'].y&&fields['ep-host'].y===fields['ep-port'].y&&fields['ep-port'].y<fields['ep-username'].y&&fields['ep-username'].y===fields['ep-password'].y);check(name+' fields inside viewport',Object.values(fields).every(r=>r.x>=0&&r.x+r.width<=width+1));}
  }
  await screenshot(name,s);result.scenes.push({name,width,theme:color,screenshot:name+'.png',dom});await save();
 }
 const nativeBefore=await native();
 const pcId=(await call('Target.createTarget',{url:'chrome-extension://'+extensionId+'/app.html?toolId=ai-proxy&view=settings&section=profiles'})).targetId;
 const pc=await attach(pcId);await call('Page.enable',{},pc);await ready(pc);
 result.pcTargetId=pcId;
 result.loadedToolShellSha256=await ev(pc,`fetch('ui/tool-shell.js').then(r=>r.arrayBuffer()).then(b=>crypto.subtle.digest('SHA-256',b)).then(b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''))`);
 result.referenceSha256=referenceFile?createHash('sha256').update(await readFile(referenceFile)).digest('hex'):null;
 try{
  if(referenceFile){
   const refId=(await call('Target.createTarget',{url:'file://'+referenceFile})).targetId;
   const ref=await attach(refId);result.referenceTargetId=refId;
   await until(()=>ev(ref,`!!document.querySelector('button[aria-label="管理全部"]')`),'frozen reference ready');
   await viewport(ref,1440);await click(ref,'button[aria-label="管理全部"]');
   await until(()=>ev(ref,'!!document.querySelector(".pc-frame")'),'reference PC');
   await capture(ref,'reference-pc-profiles-1440',1440);
   await textButton('添加代理','body',ref);await capture(ref,'reference-pc-add-1440',1440);await textButton('取消','.modal--proxy',ref);
   await click(ref,'button[aria-label^="编辑代理："]');await capture(ref,'reference-pc-edit-1440',1440);await textButton('取消','.modal--proxy',ref);
   await click(ref,'button[aria-label="返回侧边栏"]');
   for(const width of [430,360]){
    await capture(ref,'reference-side-profiles-'+width,width);
    await click(ref,'button[aria-label="添加代理"]');await capture(ref,'reference-side-add-'+width,width);await textButton('取消','.modal--proxy',ref);
   }
   await ev(ref,'(()=>{const e=document.querySelector("#scene");e.value="empty";e.dispatchEvent(new Event("change",{bubbles:true}));})()');
   await capture(ref,'reference-side-empty-430',430);
  }
  await capture(pc,'pc-empty-1440',1440);
  await until(()=>ev(host,'!!document.querySelector(".proxy-app .r86Panel")'),'quick panel ready');
  await capture(host,'side-empty-430',430);
  const samples=[['香港节点 · 主用','socks5','proxy.example.com','7890'],['美国节点 · 备用','socks5','us.example.net','1080'],['本地 Clash','http','127.0.0.1','7890']];
  for(const [name,scheme,address,port] of samples){
   await open(pc);await fill('#ep-name',name,pc);await fill('#ep-host',address,pc);await fill('#ep-port',port,pc);await choose('#ep-scheme',scheme,pc);await click(pc,'.proxyEditorForm button[type=submit]');
   await until(()=>ev(pc,'!document.querySelector(".proxyEditorDialog[open]")&&document.querySelector(".profileRecords")?.innerText.includes('+JSON.stringify(name)+')'),'saved '+name);
  }
  check('saved three proxy records without applying',JSON.stringify(await native())===JSON.stringify(nativeBefore));
  const firstProfile=await ev(pc,'document.querySelector("#options-profile").options[1].value');
  await choose('#options-profile',firstProfile,pc);
  await until(()=>ev(pc,'!!document.querySelector(".proxyRecord.isChosen")'),'saved selection');
  for(const color of ['light','dark']){
   await capture(pc,'pc-profiles-'+color+'-1440',1440,color);
   await open(pc);check('name receives initial focus',await ev(pc,'document.activeElement.id==="ep-name"'));await capture(pc,'pc-add-'+color+'-1440',1440,color);await cancel(pc);
   await click(pc,'.proxyRecord button[aria-label^="编辑"]');await until(()=>ev(pc,'!!document.querySelector("dialog[open] #ep-name")'),'edit dialog');await capture(pc,'pc-edit-'+color+'-1440',1440,color);await cancel(pc);
  }
  await theme(pc,'light');
  await open(pc);await fill('#ep-host','auth-refusal.example.com',pc);await fill('#ep-port','8080',pc);await fill('#ep-username','audit-user',pc);await fill('#ep-password','R6-transient-test-value',pc);
  await click(pc,'button[aria-label="显示密码"]');check('eye reveals password',await ev(pc,'document.querySelector("#ep-password").type==="text"'));
  await click(pc,'button[aria-label="隐藏密码"]');check('eye hides password',await ev(pc,'document.querySelector("#ep-password").type==="password"'));
  await click(pc,'.proxyEditorForm button[type=submit]');await until(()=>ev(pc,'!!document.querySelector(".proxyEditorForm [role=alert]")'),'auth refusal');
  check('unsupported credentials retain draft',await ev(pc,'document.querySelector("#ep-password").value==="R6-transient-test-value"'));
  await key('Escape','Escape',{windowsVirtualKeyCode:27},pc);await until(()=>ev(pc,'[...document.querySelectorAll("[role=alertdialog]")].some(e=>e.getClientRects().length)'),'discard confirm');await textButton('取消','[role=alertdialog]',pc);await until(()=>ev(pc,'!!document.querySelector(".proxyEditorDialog[open]")'),'keep draft');
  check('cancel discard keeps password draft',await ev(pc,'document.querySelector("#ep-password").value==="R6-transient-test-value"'));
  await key('Escape','Escape',{windowsVirtualKeyCode:27},pc);await until(()=>ev(pc,'[...document.querySelectorAll("[role=alertdialog]")].some(e=>e.getClientRects().length)'),'discard again');await textButton('确认','[role=alertdialog]',pc);await until(()=>ev(pc,'!document.querySelector(".proxyEditorDialog[open]")'),'discarded');
  check('test password absent from ordinary storage',await ev(worker,'chrome.storage.local.get(null).then(v=>!JSON.stringify(v).includes("R6-transient-test-value"))'));
  // All four protocols use the same real save path; preserve the three
  // reference records and never apply them to Chrome.
  for(const scheme of ['https','socks4','socks5']){
   await click(pc,'.proxyRecord button[aria-label^="编辑"]');
   await until(()=>ev(pc,'!!document.querySelector("dialog[open] #ep-scheme")'),'edit protocol');
   await choose('#ep-scheme',scheme,pc);await click(pc,'.proxyEditorForm button[type=submit]');
   await until(()=>ev(pc,'!document.querySelector(".proxyEditorDialog[open]")&&document.querySelector(".proxyRecord .mono")?.textContent.startsWith('+JSON.stringify(scheme.toUpperCase())+')'),'saved '+scheme);
  }
  check('HTTP HTTPS SOCKS4 SOCKS5 saved without credentials',true);
  await open(pc);
  for(let i=0;i<18;i++){
   await key('Tab','Tab',{windowsVirtualKeyCode:9},pc);
   check('modal traps Tab '+i,await ev(pc,'document.querySelector("dialog[open]").contains(document.activeElement)'));
  }
  for(let i=0;i<12;i++){
   await key('Tab','Tab',{windowsVirtualKeyCode:9,modifiers:8},pc);
   check('modal traps Shift Tab '+i,await ev(pc,'document.querySelector("dialog[open]").contains(document.activeElement)'));
  }
  await key('Escape','Escape',{windowsVirtualKeyCode:27},pc);
  await until(()=>ev(pc,'!document.querySelector(".proxyEditorDialog[open]")'),'Escape empty editor');
  check('focus returns to add trigger',await ev(pc,'document.activeElement===document.querySelector(".panelHeadActions .primary")'));
  // PC and Side Panel are separate service instances. Reload the real view
  // after cross-view writes so reference comparisons use the same persisted data.
  await reload(host);
  await until(()=>ev(host,'!!document.querySelector("#tab-tools")'),'sidebar reload');
  await click(host,'#tab-tools');
  await until(()=>ev(host,`!!document.querySelector('#extension-center-list [data-extension-key="app:ai-proxy"][data-extension-action=main]')`),'installed AI Proxy');
  await click(host,'#extension-center-list [data-extension-key="app:ai-proxy"][data-extension-action=main]');
  await until(()=>ev(host,'document.querySelector(".r86Panel")?.textContent.includes("香港节点")'),'same-data quick panel');
  for(const width of [430,360])for(const color of ['light','dark']){
   await capture(host,'side-profiles-'+color+'-'+width,width,color);
   await click(host,'.proxy-app .quickAddProxy, .proxy-app button[aria-label="添加代理"]');await until(()=>ev(host,'!!document.querySelector(".proxyEditorDialog[open]")'),'side add modal');await capture(host,'side-add-'+color+'-'+width,width,color);await cancel(host);
  }
  await click(host,'.proxy-app .quickAddProxy, .proxy-app button[aria-label="添加代理"]');
  await until(()=>ev(host,'!!document.querySelector(".proxyEditorDialog[open]")'),'quick add keyboard');
  await fill('#ep-name','R6 keyboard submission',host);await fill('#ep-host','keyboard.example.com',host);await fill('#ep-port','8443',host);
  await choose('#ep-scheme','https',host);
  await until(()=>ev(host,'document.querySelector(".proxyEditorForm button[type=submit]")?.disabled===false'),'editor state loaded');
  await ev(host,'document.querySelector("#ep-port").focus()');
  result.keyboardBefore=await ev(host,`[...document.querySelectorAll('.proxyEditorForm input,.proxyEditorForm select,.proxyEditorForm button')].map(e=>({id:e.id,tag:e.tagName,type:e.type,disabled:e.disabled,valid:e.validity?.valid,value:!['password','ep-username','ep-password'].includes(e.id)&&e.type!=='password'?e.value:undefined}))`);
  await key('Enter','Enter',{windowsVirtualKeyCode:13,text:'\r'},host);
  await key('Enter','Enter',{windowsVirtualKeyCode:13,text:'\r'},host);
  await until(()=>ev(host,'!document.querySelector(".proxyEditorDialog[open]")'),'Enter saved quick editor');
  await reload(pc);await ready(pc);
  await until(()=>ev(pc,'document.querySelectorAll(".profileRecords .proxyRecord").length===4'),'one added record');
  check('quick add Enter and rapid repeat create exactly one record',true);
  await click(pc,'.proxyRecord:last-child .quietDanger');
  await until(()=>ev(pc,'[...document.querySelectorAll("[role=alertdialog]")].some(e=>e.getClientRects().length)'),'delete test record confirm');
  await textButton('确认','[role=alertdialog]',pc);
  await until(()=>ev(pc,'document.querySelectorAll(".profileRecords .proxyRecord").length===3'),'test record removed');
  // The published Header add action owns the in-panel settings route.
  // Plain "manage" intentionally opens the PC page and is not a sidebar route.
  await click(host,'#sidebar-tool-header-actions-trigger');
  await textButton('添加代理','[role=menu]',host);
  await ready(host);await until(()=>ev(host,'!!document.querySelector(".proxyEditorDialog[open]")'),'header add route');
  await cancel(host);
  for(const width of [430,360])for(const color of ['light','dark']){
   await capture(host,'side-settings-'+color+'-'+width,width,color);await click(host,'.proxyRecord button[aria-label^="编辑"]');await until(()=>ev(host,'!!document.querySelector(".proxyEditorDialog[open]")'),'side edit modal');await capture(host,'side-edit-'+color+'-'+width,width,color);await cancel(host);
  }
  for(const section of ['profiles','rules','subscriptions','backup','diagnostic','general','official']){
   const labels={profiles:'代理配置',rules:'网站规则',subscriptions:'订阅管理',backup:'导入备份',diagnostic:'网络诊断',general:'通用设置',official:'官方网络'};
   await textButton(labels[section],'.managementNav',pc);await until(()=>ev(pc,'!!document.querySelector(".optionsContent--'+section+'")'),'section '+section);
   for(const color of ['light','dark'])await capture(pc,'pc-section-'+section+'-'+color,1440,color);
   await choose('.settingsSectionNav select',section,host);
   await until(()=>ev(host,'!!document.querySelector(".optionsContent--'+section+'")'),'side section '+section);
   for(const color of ['light','dark'])await capture(host,'side-section-'+section+'-'+color,360,color);
  }
  await textButton('网站规则','.managementNav',pc);await click(pc,'#settings-rule-add');
  await fill('#rule-domain','r6-ui.example.com',pc);await click(pc,'#rule-target-direct');
  await click(pc,'.ruleEditorForm button[type=submit]');
  await until(()=>ev(pc,'!document.querySelector(".ruleEditorForm")&&document.querySelector(".rulesList")?.textContent.includes("r6-ui.example.com")'),'saved website rule');
  await reload(pc);await ready(pc);
  await textButton('网站规则','.managementNav',pc);
  await until(()=>ev(pc,'document.querySelector(".rulesList")?.textContent.includes("r6-ui.example.com")'),'durable website rule');
  check('website rule saves and reloads without applying',true);
  check('UI regression never applies a proxy',JSON.stringify(await native())===JSON.stringify(nativeBefore));
  result.status='PASS';
 }catch(error){result.status='FAIL';result.errors.push(error.message);await screenshot('ui-failure',pc);await screenshot('side-ui-failure',host);throw error;}
 finally{await save();}
 return result;
}
