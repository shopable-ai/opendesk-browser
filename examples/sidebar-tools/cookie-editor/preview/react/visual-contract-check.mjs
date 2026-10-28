#!/usr/bin/env node
// R3.7 audit: inspect approved bytes against current dev source or strict static
// receipts. No third UI, no privileged SDK, no destructive browser actions.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';

const here=dirname(fileURLToPath(import.meta.url));
const devIndex=process.argv.indexOf('--dev-url');
const devUrl=devIndex<0?null:new URL(process.argv[devIndex+1]);
if(devUrl&&(!['127.0.0.1','localhost','[::1]'].includes(devUrl.hostname)||devUrl.protocol!=='http:'||devUrl.pathname!=='/dev.html'))throw Error('E_DEV_URL_LOOPBACK_REQUIRED');
async function devSource(){
 const response=await fetch(new URL('/dev-source.json',devUrl),{signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('E_DEV_SOURCE_RECEIPT_HTTP: '+response.status);
 const receipt=await response.json();
 if(receipt.mode!=='CURRENT_SOURCE_DEV'||receipt.generatedHtmlUsed!==false)throw Error('E_DEV_SOURCE_RECEIPT_INVALID');
 const repo=resolve(here,'../../../../..');
 for(const [path,digest] of Object.entries(receipt.inputs)){
  if(path.startsWith('/')||path.split('/').includes('..'))throw Error('E_DEV_SOURCE_PATH');
  if(createHash('sha256').update(await readFile(join(repo,path))).digest('hex')!==digest)throw Error('E_DEV_SOURCE_DRIFT: '+path);
 }
 if(createHash('sha256').update(JSON.stringify(receipt.inputs)).digest('hex')!==receipt.sourceHash)throw Error('E_DEV_SOURCE_HASH');
 for(const path of ['examples/sidebar-tools/cookie-editor/preview/react/src/main.jsx','examples/sidebar-tools/cookie-editor/app/CookieEditorApp.jsx','src/libs/page-frameworks/react-19.2.0.js','dist/development/sidebar-shared-ui.js'])if(!receipt.inputs[path])throw Error('E_DEV_SOURCE_MISSING: '+path);
 return receipt;
}
const selfTest=process.argv.includes('--self-test');
const sourceBefore=!selfTest&&devUrl?await devSource():null;
const approvedPath=resolve(here,'../cookie-editor.html');
const reactPath=join(here,'index.html');
const contract=JSON.parse(await readFile(join(here,'visual-contract.json'),'utf8'));
const originalBytes=await readFile(approvedPath);
const gitBlob=createHash('sha1').update('blob '+originalBytes.length+'\0').update(originalBytes).digest('hex');
if(gitBlob!==contract.approvedHtml.gitBlobSha)throw Error('E_APPROVED_HTML_CHANGED: '+gitBlob);
let previewCheck='';
if(!selfTest&&!devUrl)try{
 previewCheck=execFileSync(process.execPath,[join(here,'build-preview.mjs'),'--check'],
   {cwd:here,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 if(!previewCheck.includes('R520_PREVIEW_MATCH'))throw Error('missing preview SHA readback');
}catch(cause){
 throw Error('E_R35_REACT_PREVIEW_STALE: static source receipt rejected; use --dev-url for current dev source; '+
   String(cause.stderr||cause.message).slice(0,450));
}
const enforce=process.argv.includes('--enforce');
const all=process.argv.includes('--all');
const theme=process.argv.includes('--dark')?'dark':'light';
const widths=all?[320,360,380,400,440,520]:[380];
const tabs=process.argv.includes('--cookie-only')?['cookie']:process.argv.includes('--g1')?['cookie','accounts']:
  ['cookie','accounts','enterprise','market','custom','circle'];
const statesIndex=process.argv.indexOf('--states');
const states=statesIndex<0?['default']:process.argv[statesIndex+1].split(',');
if(states.some(state=>!Object.hasOwn(contract.cookieStates,state)))throw Error('E_UNKNOWN_COOKIE_STATE');
if(statesIndex>=0&&!process.argv.includes('--cookie-only'))throw Error('E_COOKIE_STATES_REQUIRE_COOKIE_ONLY');
const outIndex=process.argv.indexOf('--output');
const output=outIndex>=0?resolve(process.argv[outIndex+1]):resolve(here,devUrl?'../../../../../artifacts/cookie-editor-r37-dev/audit':'../../../../../artifacts/cookie-editor-r35-visual');
await mkdir(output,{recursive:true});
const browser=selfTest?null:await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined});
const diffs=[],screenshots=[],errors=[],inventories=[];
const styleKeys=['fontFamily','fontSize','fontWeight','lineHeight','color','backgroundColor',
  'borderTopColor','borderBottomColor','borderTopWidth','borderRadius',
  'paddingTop','paddingBottom','paddingLeft','paddingRight',
  'whiteSpace','textOverflow','width','height'];
const normalize=(value)=>typeof value==='string'?value.trim().replace(/\s+/g,' '):value;
const near=(left,right,key)=>{
  if(left===right)return true;
  if(/^(width|height|padding|borderTopWidth)/i.test(key)){
    const a=Number.parseFloat(left),b=Number.parseFloat(right);
    return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1;
  }
  return false;
};
// Record every visible node, including laboratory and structural wrappers.
// Only semantic paint units are paired; raw DOM is never discarded.
async function inventory(page,selector){
 return page.locator('body').evaluate((body,config)=>{
  const root=document.querySelector(config.selector),origin=root.querySelector(config.side==='html'?'.sitebar':'.site-bar').getBoundingClientRect();
  const norm=value=>String(value||'').trim().replace(/\s+/g,' ');
  const visible=el=>{
   const s=getComputedStyle(el);
   if(s.display==='none'||s.visibility==='hidden'||!el.getClientRects().length)return false;
   for(let parent=el.parentElement;parent;parent=parent.parentElement)
    if(parent.matches('details:not([open])')&&!parent.querySelector(':scope > summary')?.contains(el))return false;
   return true;
  };
  const nodes=[body,...body.querySelectorAll('*')].filter(visible),index=new Map(nodes.map((node,i)=>[node,i]));
  const regions=[
   ['export','.popover,.cookie-export-popover'],['import','.editor:has(#importText),#cookie-import-drawer'],
   ['editor','#cookieEditForm,.cookie-inline-editor'],['account-menu','.account-pop,.cookie-account-menu'],
   ['current-account','.current-strip,.cookie-account-current'],['refresh-setting','.auto-refresh-setting,.cookie-account-setting'],
   ['accounts-heading','.account-head,.cookie-account-header'],['accounts','.accounts-list,.cookie-account-list'],
   ['membership','.membership-block,.cookie-business-membership'],['site','.sitebar,.site-bar'],['tabs','.tabs,.cookie-product-tabs'],
   ['filter','.filterbar,.filter-panel'],['search','.searchbar'],['toolbar','.toolbar,.list-toolbar'],['cookies','.cookie-list'],
   ['accounts-note','.note,.cookie-account-security-note'],['account-feedback','.status,.cookie-account-feedback,.cookie-account-notice']
  ];
  const controlRole=el=>(['button','switch','tab','menuitem','checkbox','radio','textbox','searchbox','combobox','slider','spinbutton'].includes(el.getAttribute('role'))?el.getAttribute('role'):'')||(el.matches('button')?'button':el.matches('input')?({checkbox:'checkbox',search:'searchbox'}[el.type]||'textbox'):el.matches('select')?'combobox':el.matches('textarea')?'textbox':el.matches('a')?'link':el.matches('summary')?'disclosure':'');
  const label=el=>norm(el.getAttribute('aria-label')||(el.labels?.length?[...el.labels].map(x=>x.textContent).join(' '):el.getAttribute('title')||el.textContent));
  const controlKey=el=>{
   if(el.matches('.cookie-trigger,.row-trigger'))return 'row-toggle';
   if(el.matches('[role=tab]'))return 'tab:'+norm(el.textContent);
   const fields={editName:'名称',editValue:'Cookie 值',editExpirationMode:'有效期方式',editExpiryAt:'过期时间（Expiration，本地时间）',editDuration:'有效时长',editDomain:'Domain',editPath:'Path',editSameSite:'SameSite',editSecure:'Secure',editHttp:'HttpOnly',exportValues:'包含 Cookie 值'};
   if(fields[el.id])return fields[el.id];
   const action=el.getAttribute('data-action'),aliases={'filter-panel':'筛选与排序','import':'导入 Cookie','export':'导出 Cookie','new-cookie':'新建 Cookie','clear':'安全清理本站 Cookie','auto-toggle':'管理自动切换规则','save-profile':'保存当前 Cookie 为账号','menu':'account-more','cancel-cookie':'取消','remove-cookie':'删除 Cookie'};
   if(aliases[action])return aliases[action];
   if(el.matches('[aria-haspopup=menu]'))return 'account-more';
   return label(el)||el.name||el.type||el.tagName.toLowerCase();
  };
  const occurrence=new Map();
  return nodes.map((el,i)=>{
   const box=el.getBoundingClientRect(),style=getComputedStyle(el),attrs=Object.fromEntries([...el.attributes].map(a=>[a.name,a.value]));
   const text=norm([...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(''));
   const preview=!root.contains(el)||!!el.closest('.host-preview,.footer,.sitehint,.site-select');
   const region=regions.find(([,selector])=>el.closest(selector))?.[0]||'content';
   const row=el.closest('.cookie-row'),account=el.closest('.account-row,.cookie-account-card');
   const entity=row?norm(row.querySelector('.cookie-key strong,.row-text strong')?.textContent):account?norm(account.querySelector('.account-title strong,.cookie-account-card-text strong')?.textContent):'';
   const control=!!controlRole(el),owner=el.parentElement?.closest('button,a,summary,[role=tab],[role=menuitem]');
   const svg=el.closest('svg'),isSvg=el.tagName.toLowerCase()==='svg';
   const kind=control?'CONTROL':isSvg?'ICON':text&&(!owner||row&&el.matches('strong,small,abbr'))?'COPY':'LAYOUT';
   const slot=[['current-label','.current-strip .label,.cookie-account-current small'],['refresh-title','.setting-label,.cookie-account-setting strong'],['refresh-help','.setting-help,.cookie-account-setting small'],['account-count','.account-head small,.cookie-account-count'],['security-note','.accounts-content>.note,.cookie-account-security-note'],['membership-description','.membership-copy>p,.cookie-business-membership-header>div>p']].find(([,selector])=>el.matches(selector))?.[0];
   const semantic=slot||(control?controlKey(el):isSvg?'svg':el.matches('strong,h1,h2,h3')?'heading':el.matches('small')?'description':el.matches('abbr')?'flag:'+label(el):text);
   const ownerKey=slot?'':owner?controlKey(owner):el.matches('strong,small,abbr')?'row-text':'';
   const base=[region,entity,kind,ownerKey,semantic].join('|'),nth=occurrence.get(base)||0;occurrence.set(base,nth+1);
   const ranges=[...el.childNodes].filter(n=>n.nodeType===3&&norm(n.textContent)).map(n=>{const range=document.createRange();range.selectNodeContents(n);return range.getBoundingClientRect();});
   const textBox=ranges.length?{x:Math.min(...ranges.map(b=>b.x)),y:Math.min(...ranges.map(b=>b.y)),width:Math.max(...ranges.map(b=>b.right))-Math.min(...ranges.map(b=>b.x)),height:Math.max(...ranges.map(b=>b.bottom))-Math.min(...ranges.map(b=>b.y))}:null;
   const labelNode=el.matches('[role=tab]')?el.querySelector('.cookie-tab-label')||el:el;
   const paintStyle=getComputedStyle(labelNode);
   const state={disabled:el.matches(':disabled'),checked:'checked'in el?el.checked:null,selected:el.getAttribute('aria-selected'),expanded:el.getAttribute('aria-expanded'),pressed:el.getAttribute('aria-pressed'),open:'open'in el?el.open:null,inert:el.closest('[inert]')!==null,focused:document.activeElement===el,value:'value'in el?el.value:null};
   return {index:i,parent:index.get(el.parentElement)??null,tag:el.tagName.toLowerCase(),attrs,text,control,label:label(el),kind,region,entity,owner:ownerKey,role:controlRole(el),key:base+'|'+nth,
    contractStatus:preview?'PREVIEW_ONLY':'LOCKED',context:el.matches('.site-hostname')?'HOST_CONTEXT':null,
    style:Object.fromEntries(config.styleKeys.map(key=>[key,style[key]])),paintStyle:Object.fromEntries(config.styleKeys.map(key=>[key,paintStyle[key]])),
    rect:{x:box.x-origin.x,y:box.y-origin.y,width:box.width,height:box.height},textRect:textBox?{...textBox,x:textBox.x-origin.x,y:textBox.y-origin.y}:null,state,
    svg:isSvg?{viewBox:el.getAttribute('viewBox'),geometry:[...el.querySelectorAll('*')].map(shape=>({tag:shape.tagName.toLowerCase(),attrs:Object.fromEntries([...shape.attributes].filter(a=>!['class','style'].includes(a.name)).sort((a,b)=>a.name.localeCompare(b.name)).map(a=>[a.name,a.value]))}))}:null};
  });
 },{styleKeys:contract.inventory.styleKeys,selector,side:selector==='#panel'?'html':'react'});
}
const transparent=value=>!value||value==='transparent'||/rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(value);
function paintedStyle(node){
 const result={},style=node.paintStyle||node.style;
 for(const key of ['color','backgroundColor','boxShadow','opacity','borderRadius',...(node.kind==='ICON'?['fill','stroke','strokeWidth']:['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing'])]){
  if(key==='backgroundColor'&&transparent(style[key]))continue;
  result[key]=style[key];
 }
 if(node.tag==='input'&&['checkbox','radio'].includes(node.attrs?.type)||['switch','checkbox','radio'].includes(node.role)){for(const key of ['color','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing'])delete result[key];result.accentColor=style.accentColor;}
 for(const side of ['Top','Right','Bottom','Left']){
  const width=style['border'+side+'Width'],color=style['border'+side+'Color'];
  if(parseFloat(width)>0&&!transparent(color))result['border'+side]=[width,color];
 }
 if(!result.backgroundColor&&!Object.keys(result).some(key=>/^border(?:Top|Right|Bottom|Left)$/.test(key))&&(!result.boxShadow||result.boxShadow==='none'))delete result.borderRadius;
 return result;
}
function inventoryDiff(html,react,scene){
 const current=new Map(react.filter(n=>n.contractStatus!=='PREVIEW_ONLY'&&n.kind!=='LAYOUT'&&!n.context).map(n=>[n.key,n]));
 for(const old of html.filter(n=>n.contractStatus!=='PREVIEW_ONLY'&&n.kind!=='LAYOUT'&&!n.context)){
  const node=current.get(old.key);current.delete(old.key);
  if(!node){diffs.push({...scene,id:old.key,status:'LOCKED',kind:old.kind+'_MISSING',html:old,react:null});continue;}
  if(old.region!==node.region||old.entity!==node.entity||old.kind!==node.kind||old.owner!==node.owner||old.role!==node.role){errors.push({...scene,message:'MATCH_IDENTITY_ERROR'});diffs.push({...scene,id:old.key,status:'TEST_INFRA_FAIL',kind:'TEST_INFRA_FAIL',message:'MATCH_IDENTITY_ERROR'});continue;}
  if(old.kind==='COPY'&&old.text!==node.text){const domainNote=old.entity==='analytics_consent'&&node.text===old.text+' · 跨子域';diffs.push({...scene,id:old.key,status:domainNote?'SAFETY_EXCEPTION':old.region==='accounts'&&old.key.includes('description')?'DYNAMIC':'LOCKED',kind:'STATIC_COPY',html:old.text,react:node.text,reason:domainNote?'此 Domain Cookie 跨子域范围说明必须可发现；只标记此行新增文案，尺寸颜色继续比较。':undefined});}
  if(old.kind==='ICON'&&JSON.stringify(old.svg)!==JSON.stringify(node.svg))diffs.push({...scene,id:old.key,status:'LOCKED',kind:'ICON_PATH_DIFFERENCE',html:old.svg,react:node.svg});
  for(const property of ['rect','style','state']){
   const left=property==='style'?paintedStyle(old):property==='rect'&&old.kind==='COPY'?old.textRect||old.rect:old[property],right=property==='style'?paintedStyle(node):property==='rect'&&node.kind==='COPY'?node.textRect||node.rect:node[property];
   const changed=[...new Set([...Object.keys(left),...Object.keys(right)])].filter(key=>{
    if(property==='state'&&['focused','value'].includes(key))return false;
    if(property==='style')return JSON.stringify(left[key])!==JSON.stringify(right[key]);
    return !near(left[key],right[key],key);
   });
   const enhanced=property==='state'?changed.filter(key=>['expanded','pressed'].includes(key)&&left[key]===null&&right[key]==='false'):[];
   if(enhanced.length)diffs.push({...scene,id:old.key,status:'DYNAMIC',kind:'STATE_ENHANCEMENT',properties:enhanced,html:left,react:right});
   const gap=changed.filter(key=>!enhanced.includes(key));
   if(gap.length)diffs.push({...scene,id:old.key,status:'LOCKED',kind:property==='rect'?'RECT':property==='style'?'COMPUTED_STYLE':'CONTROL_STATE',properties:gap,html:left,react:right});
  }
 }
 for(const node of current.values())diffs.push({...scene,id:node.key,status:'LOCKED',kind:node.kind+'_EXTRA',html:null,react:node});
}
async function sample(page,selector,icon=false){
 const node=page.locator(selector).first();
 if(await node.count()===0||!(await node.isVisible()))return {missing:true};
 return node.evaluate((el,args)=>{
   const style=getComputedStyle(el),box=el.getBoundingClientRect();
   const result={style:{},geometry:{x:box.x,y:box.y,width:box.width,height:box.height}};
   for(const key of args.keys)result.style[key]=style[key];
   if(args.icon){
     result.icon={
       svg:el.tagName.toLowerCase()==='svg',
       paths:[...el.querySelectorAll('path')].map(p=>p.getAttribute('d')),
       geometry:[...el.querySelectorAll('circle,rect,line,polyline,polygon,ellipse')].map(p=>p.outerHTML)
     };
   }
   return result;
 },{keys:styleKeys,icon});
}
async function textValue(page,record,side){
 const node=page.locator(record[side]).first();
 if(await node.count()===0)return null;
 return normalize(record.attr?await node.getAttribute(record.attr):await node.textContent());
}
async function overflow(page,selector){
 return page.locator(selector).first().evaluate(el=>({
   scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,scrollHeight:el.scrollHeight,
   clientHeight:el.clientHeight
 }));
}
if(selfTest){
 const {default:assert}=await import('node:assert/strict');
 const base={key:'toolbar||COPY||heading|0',kind:'COPY',region:'toolbar',entity:'',owner:'',role:'',tag:'strong',attrs:{},contractStatus:'LOCKED',label:'Cookie',text:'Cookie',style:{color:'rgb(0, 0, 0)',backgroundColor:'rgba(0, 0, 0, 0)',borderTopWidth:'0px',borderTopColor:'rgba(0, 0, 0, 0)'},rect:{x:0,y:0,width:40,height:20},state:{expanded:null},svg:null};
 const reset=()=>{diffs.length=0;errors.length=0;};
 const check=(left,right)=>{reset();inventoryDiff(left,right,{});};
 check([base],[{...base,key:'tabs||COPY||heading|0',region:'tabs'}]);assert.deepEqual(diffs.map(d=>d.kind),['COPY_MISSING','COPY_EXTRA']);
 check([base],[{...base,region:'tabs'}]);assert.equal(diffs[0].kind,'TEST_INFRA_FAIL');
 check([{...base,kind:'LAYOUT'}],[{...base,kind:'LAYOUT',tag:'span',style:{display:'grid'}}]);assert.equal(diffs.length,0);
 check([base],[{...base,style:{...base.style,borderTopWidth:'1px'}}]);assert.equal(diffs.length,0,'transparent border does not paint');
 check([base],[{...base,style:{...base.style,borderTopWidth:'1px',borderTopColor:'rgb(0, 0, 0)'}}]);assert.equal(diffs[0].kind,'COMPUTED_STYLE','opaque border remains a gap');
 check([base],[{...base,state:{expanded:'false'}}]);assert.equal(diffs[0].kind,'STATE_ENHANCEMENT');
 check([],[{...base,kind:'ICON',owner:'额外操作'}]);assert.equal(diffs[0].status,'LOCKED');
 const domain={...base,entity:'analytics_consent',text:'到期 · .example.com'};
 check([domain],[{...domain,text:domain.text+' · 跨子域',style:{...base.style,color:'rgb(1, 1, 1)'}}]);assert.equal(diffs.find(d=>d.kind==='STATIC_COPY').status,'SAFETY_EXCEPTION');assert.equal(diffs.find(d=>d.kind==='COMPUTED_STYLE').status,'LOCKED');
 console.log('R37_MATCHER_SELF_TEST_PASS 8 cases');process.exit(0);
}
try{
 for(const width of widths){
  const context=await browser.newContext({viewport:{width:Math.max(620,width+70),height:900},deviceScaleFactor:1,timezoneId:'Asia/Shanghai'});
  const [oldPage,reactPage]=await Promise.all([context.newPage(),context.newPage()]);
  oldPage.setDefaultTimeout(10000);
  reactPage.setDefaultTimeout(10000);
  for(const page of [oldPage,reactPage])page.on('pageerror',error=>errors.push({width,message:error.message}));
  for(const page of [oldPage,reactPage])await page.clock.setFixedTime(new Date(contract.scenario.fixedTime));
  // The locked prototype is self-contained; navigate via its exact bytes in
  // the same Chromium context. file:// navigation left compositor screenshot
  // requests unresolved on the CI runner; setContent uses identical markup as
  // the approved srcdoc in the source-bound A/B wrapper.
  await oldPage.setContent(originalBytes.toString('utf8'),{waitUntil:'load'});
  await oldPage.locator('#labWidth').selectOption(String(width));
  await reactPage.goto(devUrl?.href||pathToFileURL(reactPath).href,{waitUntil:'load'});
  await reactPage.locator('.row-trigger').first().waitFor({state:'visible'});
  await reactPage.locator('.demo-lab>summary').click();
  await reactPage.getByTestId('scenario').selectOption(contract.scenario.reactScenario);
  await reactPage.locator('.row-trigger').first().waitFor({state:'visible'});
  await reactPage.locator('.demo-lab>summary').click();
  if(width!==380){
    await reactPage.locator('.demo-lab>summary').click();
    await reactPage.getByTestId('width').selectOption(String(width));
  }
  if(theme==='dark'){
    await oldPage.locator('#labTheme').click();
    if(await reactPage.locator('.demo-lab').getAttribute('open')===null)
      await reactPage.locator('.demo-lab>summary').click();
    await reactPage.getByRole('button',{name:'深色',exact:true}).click();
  }
  const tabLabels={accounts:'Accounts',enterprise:'Enterprise',market:'Market',
    custom:'Custom',circle:'Circle'};
  for(const {tab,state} of tabs.flatMap(tab=>(tab==='cookie'?states:['default']).map(state=>({tab,state})))){
   console.log(JSON.stringify({audit:'R35_VISUAL_SCENE',width,theme,tab,state}));
   try{
   if(state!=='default'){
     await oldPage.setContent(originalBytes.toString('utf8'),{waitUntil:'load'});
     await oldPage.locator('#labWidth').selectOption(String(width));
     if(theme==='dark')await oldPage.locator('#labTheme').click();
     if(await reactPage.locator('.demo-lab').getAttribute('open')===null)await reactPage.locator('.demo-lab>summary').click();
     await reactPage.getByRole('button',{name:'重置',exact:true}).click();
     await reactPage.getByTestId('scenario').selectOption(contract.scenario.reactScenario);
     await reactPage.locator('.row-trigger').first().waitFor({state:'visible'});
     await reactPage.locator('.demo-lab>summary').click();
   }
   // Each scene starts from the Cookie view: React unmounts its list when a
   // business tab is selected, while the prototype retains its hidden DOM.
   await oldPage.locator('#tabCookies').click();
   await reactPage.locator('#cookie-product-tab-cookie').click();
   await reactPage.locator('.row-trigger').first().waitFor({state:'visible'});
   const fixtureNames=await Promise.all([
     oldPage.locator('.cookie-key strong').allTextContents(),
     reactPage.locator('.row-text strong').allTextContents()
   ]);
   if(JSON.stringify([...fixtureNames[0]].sort())!==JSON.stringify([...fixtureNames[1]].sort()))throw Error('E_SCENE_DATA_MISMATCH');
   if(tab!=='cookie'){
     await oldPage.locator('#tab'+tabLabels[tab]).click();
     await reactPage.locator('#cookie-product-tab-'+tab).click();
     await oldPage.locator('#view'+(tab==='cookie'?'Cookies':tabLabels[tab])).waitFor({state:'visible'});
     await reactPage.locator('#cookie-product-panel-'+tab).waitFor({state:'visible'});
   }
   if(tab==='accounts'){
     // Match the prototype's applied snapshot through the normal mock action;
     // saved account metadata alone is not a verified switch receipt.
     await reactPage.locator('[data-account-alias="work"]').getByRole('button',{name:'切换',exact:true}).click();
     await reactPage.locator('[data-account-alias="work"].is-current').waitFor({state:'visible'});
   }
   const referenceViewport=await oldPage.locator('#panel').evaluate(root=>{
    const site=root.querySelector('.sitebar').getBoundingClientRect(),scroll=root.querySelector('#panelScroll').getBoundingClientRect();
    return {width:site.width,productHeight:scroll.bottom-site.top,scrollHeight:scroll.height,origin:{x:site.x,y:site.y}};
   });
   const viewportNormalization=await reactPage.locator('.cookie-app').evaluate((root,target)=>{
    const before=root.getBoundingClientRect().toJSON(),style=getComputedStyle(root);
    const outerHeight=target.productHeight+parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth);
    root.style.flex='0 0 auto';root.style.height=outerHeight+'px';root.style.maxHeight=outerHeight+'px';
    return {target,before,after:root.getBoundingClientRect().toJSON(),scope:'PREVIEW_OUTER_FRAME_ONLY'};
   },referenceViewport);
   if(tab==='cookie')for(const action of contract.cookieStates[state]){
     for(const [side,page] of [['html',oldPage],['react',reactPage]]){
       const node=page.locator(action[side]);
       if(action.fill!==undefined)await node.fill(action.fill);
       else if(action.select!==undefined)await node.selectOption(action.select);
       else await node.click();
     }
   }
   // Hover must be an explicit scene, never an accidental result of the last
   // driver click. Keep keyboard focus and all control states intact.
   for(const page of [oldPage,reactPage])await page.mouse.move(0,0);
   const layout=contract.layoutOrder?.[tab];
   if(layout){
     for(const [origin,page] of [['html',oldPage],['react',reactPage]]){
       const points=[];
       for(const selector of layout[origin]){
         const element=page.locator(selector).first();
         const box=await element.boundingBox();
         points.push({selector,y:box?.y??null});
       }
       if(points.some(item=>item.y===null)||points.some((item,i)=>i>0&&item.y+1<points[i-1].y))
         diffs.push({width,theme,tab,state,id:origin+'-section-order',status:'LOCKED',
           kind:'STRUCTURE_ORDER',points});
     }
   }
   const empty=await reactPage.locator('.cookie-editor-react svg').evaluateAll(nodes=>
     nodes.filter(node=>!node.querySelector('path,circle,rect,line,polyline,polygon,ellipse'))
       .map(node=>node.outerHTML.slice(0,220)));
   if(empty.length)diffs.push({width,theme,tab,state,id:'empty-svg',status:'LOCKED',
     kind:'EMPTY_REACT_SVG',count:empty.length,elements:empty});
   const selectors=contract.elements.filter(item=>item.tab===tab);
   for(const item of selectors){
    const [html,react]=await Promise.all([sample(oldPage,item.html,item.icon),sample(reactPage,item.react,item.icon)]);
    if(html.missing||react.missing){
      diffs.push({width,theme,tab,state,id:item.id,status:item.status,kind:'MISSING_ELEMENT',
        html,react,source:item.source,css:item.css});continue;
    }
    for(const key of item.compare){
      const oldValue=html.style[key],newValue=react.style[key];
      if(!near(oldValue,newValue,key)){
       diffs.push({width,theme,tab,state,id:item.id,status:item.status,kind:'COMPUTED_STYLE',
         property:key,html:oldValue,react:newValue,source:item.source,css:item.css});
      }
    }
    if(item.icon){
      if(!react.icon.svg||!react.icon.paths.length&&!react.icon.geometry.length)
        diffs.push({width,theme,tab,state,id:item.id,status:item.status,kind:'EMPTY_REACT_SVG',source:item.source});
      else if(JSON.stringify(html.icon)!==JSON.stringify(react.icon))
        diffs.push({width,theme,tab,state,id:item.id,status:item.status,kind:'ICON_PATH_DIFFERENCE',
          html:html.icon,react:react.icon,source:item.source});
    }
   }
   for(const item of contract.staticText.filter(x=>x.tab===tab)){
    const [html,react]=await Promise.all([textValue(oldPage,item,'html'),textValue(reactPage,item,'react')]);
    if(html===null||react===null||!(item.value?html===item.value&&react===item.value:
      html.includes(item.contains)&&react.includes(item.contains))){
       diffs.push({width,theme,tab,state,id:item.id,status:item.status,kind:'STATIC_COPY',html,react,
         expected:item.value||item.contains});
    }
   }
   const [htmlInventory,reactInventory]=await Promise.all([inventory(oldPage,'#panel'),inventory(reactPage,'.cookie-app')]);
   if(await reactPage.getByTestId('scenario').inputValue()!==contract.scenario.reactScenario)throw Error('E_SCENE_RESET_DURING_CAPTURE');
   const scene={width,theme,tab,state};
   const hostContext={html:await oldPage.locator('#sitePick').inputValue(),react:await reactPage.locator('.site-hostname').innerText(),reason:'原型站点下拉和其箭头属于实验台；正式只读Host站点名独立核对，不跨区域匹配。'};
   if(hostContext.html!==hostContext.react)diffs.push({...scene,id:'host-context-value',status:'LOCKED',kind:'STATIC_COPY',...hostContext});
   inventoryDiff(htmlInventory,reactInventory,scene);
   const sceneName=tab+(state==='default'?'':'-'+state);
   const inventoryPath=join(output,'dom-'+width+'-'+theme+'-'+sceneName+'.json');
   await writeFile(inventoryPath,JSON.stringify({scene,sourceHash:sourceBefore?.sourceHash,viewportNormalization,hostContext,coverage:{html:{total:htmlInventory.length,product:htmlInventory.filter(n=>n.contractStatus!=='PREVIEW_ONLY').length,preview:htmlInventory.filter(n=>n.contractStatus==='PREVIEW_ONLY').length},react:{total:reactInventory.length,product:reactInventory.filter(n=>n.contractStatus!=='PREVIEW_ONLY').length,preview:reactInventory.filter(n=>n.contractStatus==='PREVIEW_ONLY').length}},html:htmlInventory,react:reactInventory},null,2)+'\n');
   inventories.push(inventoryPath);
   for(const [name,page,selector] of [['html',oldPage,'#panel'],['react',reactPage,'.cookie-app']]){
    const data=await overflow(page,selector);
    if(data.scrollWidth>data.clientWidth+1)
      diffs.push({width,theme,tab,state,id:name+'-container',status:'LOCKED',kind:'HORIZONTAL_OVERFLOW',data});
    const path=join(output,width+'-'+theme+'-'+sceneName+'-'+name+'.png');
    // Element screenshot waits for layout "stability"; the approved prototype
    // contains animated interactions. Sample actual bounds and screenshot
    // the page clip without waiting for unrelated animations to settle.
    try{
      const rect=await page.locator(selector).first().boundingBox();
      const viewport=page.viewportSize();
      if(!rect||!viewport)throw Error('missing screenshot bounds');
      const x=Math.max(0,rect.x),y=Math.max(0,rect.y);
      const crop={x,y,width:Math.min(rect.width,viewport.width-x),
        height:Math.min(rect.height,viewport.height-y)};
      if(crop.width<=0||crop.height<=0)throw Error('screenshot outside viewport');
      // CDP captures the same real Chromium compositor frame without Playwright's
      // unrelated animation/font-stability wait on the approved prototype.
      console.log(JSON.stringify({audit:'R36_CAPTURE_START',width,theme,tab,page:name}));
      const session=await context.newCDPSession(page);
      let completed=false;
      try{
        // Chromium can stop responding to compositor capture on animated
        // reference documents. Never let one frame block the entire CI report.
        const result=await Promise.race([
          session.send('Page.captureScreenshot',{
            format:'png',fromSurface:true,
            clip:{x:crop.x,y:crop.y,width:crop.width,height:crop.height,scale:1}
          }),
          new Promise((_,reject)=>setTimeout(()=>reject(
            Error('E_R36_CDP_SCREENSHOT_DEADLINE')),5500))
        ]);
        completed=true;
        await writeFile(path,Buffer.from(result.data,'base64'));
        console.log(JSON.stringify({audit:'R36_CAPTURE_OK',width,theme,tab,page:name}));
      }finally{
        if(completed)await Promise.race([
          session.detach(),
          new Promise(resolve=>setTimeout(resolve,1000))
        ]);
      }
      screenshots.push(path);
    }catch(error){
      const message=String(error?.message||error);
      errors.push({width,theme,tab,state,page:name,message});
      diffs.push({width,theme,tab,state,id:name+'-screenshot',status:'TEST_INFRA_FAIL',
        kind:'TEST_INFRA_FAIL',message});
    }
   }
   }catch(error){
    const message=String(error?.message||error);
    errors.push({width,theme,tab,state,message});
    diffs.push({width,theme,tab,state,id:'scene-execution',status:'TEST_INFRA_FAIL',kind:'TEST_INFRA_FAIL',message});
   }
   // Checkpoint every completed width/tab; runner cancellation must not erase
   // evidence from prior scenes. Do not report browser infra as visual parity.
   await writeFile(join(output,'scene-'+width+'-'+theme+'-'+tab+(state==='default'?'':'-'+state)+'.json'),
     JSON.stringify({width,theme,tab,state,
       status:errors.some(x=>x.width===width&&x.tab===tab&&x.state===state)?'TEST_INFRA_FAIL':
         diffs.some(x=>x.width===width&&x.tab===tab&&x.state===state&&x.status==='LOCKED')?'VISUAL_GAP':'REVIEW_REQUIRED',
       diffs:diffs.filter(x=>x.width===width&&x.tab===tab&&x.state===state),
       errors:errors.filter(x=>x.width===width&&x.tab===tab&&x.state===state),
       screenshots:screenshots.filter(x=>x.includes(width+'-'+theme+'-'+tab+(state==='default'?'':'-'+state)+'-'))},null,2)+'\n');
  }
  await context.close();
 }
}catch(error){
 const message=String(error?.message||error);
 errors.push({message});diffs.push({id:'audit-execution',status:'TEST_INFRA_FAIL',kind:'TEST_INFRA_FAIL',message});
}finally{await browser.close();}
let sourceAfter=null;
try{sourceAfter=devUrl?await devSource():null;}catch(error){errors.push({message:String(error)});diffs.push({id:'source-readback',status:'TEST_INFRA_FAIL',kind:'TEST_INFRA_FAIL',message:String(error)});}
if(sourceBefore&&sourceBefore.sourceHash!==sourceAfter?.sourceHash){
 errors.push({message:'E_SOURCE_CHANGED_DURING_AUDIT'});
 diffs.push({id:'dev-source',status:'TEST_INFRA_FAIL',kind:'TEST_INFRA_FAIL',message:'E_SOURCE_CHANGED_DURING_AUDIT'});
}
for(const diff of diffs){
 diff.category=diff.kind==='TEST_INFRA_FAIL'?'TEST_INFRA_FAIL':diff.kind==='STATE_ENHANCEMENT'?'A11Y':/ICON|SVG/.test(diff.kind)?'ICON':/COPY/.test(diff.kind)?'COPY':/STATE/.test(diff.kind)?'STATE':diff.kind==='RECT'?'RECT':/STYLE/.test(diff.kind)?'STYLE':'STRUCTURE';
 diff.classification=diff.category;
}
const report={schema:contract.schema,approvedGitBlob:gitBlob,
  builtReactSource:devUrl?'CURRENT_SOURCE_DEV':'CHECKED_BY_EXISTING_BUILD_PREVIEW',devUrl:devUrl?.href,sourceBefore,sourceAfter,inventories,scenario:contract.scenario,theme,widths,
  notes:[devUrl?'Current JSX served by Vite; generated index.html is not used.':'Static mode requires the existing strict source receipt.',
    'Screenshots are from two real files, not a composite replacement UI.',
    'Genuine browser 200% zoom, Mac Chrome Host permissions and real Cookie operations require separate tests.',
    'Token color differences are reported, not silently waived.'],
  status:errors.length?'TEST_INFRA_FAIL':diffs.some(x=>x.status==='LOCKED')?'GAP':'REVIEW_REQUIRED',
  counts:{total:diffs.length,locked:diffs.filter(x=>x.status==='LOCKED').length,
    testInfra:diffs.filter(x=>x.kind==='TEST_INFRA_FAIL').length,
    missing:diffs.filter(x=>x.kind==='MISSING_ELEMENT'||x.kind.endsWith('_MISSING')).length,
    emptyIcons:diffs.filter(x=>x.kind==='EMPTY_REACT_SVG').length},
  diffs,errors,screenshots,exceptions:contract.exceptions};
await writeFile(join(output,'report-'+theme+'-'+(all?'all':'380')+'.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(join(output,'default-gap-list.json'),JSON.stringify({status:report.status,sourceHash:sourceBefore?.sourceHash,sourceAfter:sourceAfter?.sourceHash,
 gaps:diffs.filter(d=>d.status==='LOCKED').map(d=>({tab:d.tab,state:d.state,id:d.id,category:d.category,kind:d.kind,properties:d.properties||[d.property].filter(Boolean),
  changes:d.properties?Object.fromEntries(d.properties.map(key=>[key,{html:d.html?.[key],react:d.react?.[key]}])):{html:d.html?.index===undefined?d.html:d.html.key,react:d.react?.index===undefined?d.react:d.react.key}})),
 review:diffs.filter(d=>d.status!=='LOCKED'),errors},null,2)+'\n');
console.log(JSON.stringify({status:report.status,report:join(output,'report-'+theme+'-'+(all?'all':'380')+'.json'),
 counts:report.counts,errors:errors.length,
 exampleDiffs:diffs.slice(0,16).map(({width,tab,id,kind,property,html,react,source,css})=>
   ({width,tab,id,kind,property,html:typeof html==='object'?'see full report':html,react:typeof react==='object'?'see full report':react,source,css}))},null,2));
if(enforce&&(report.counts.locked||errors.length))process.exitCode=1;
