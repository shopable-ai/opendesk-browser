#!/usr/bin/env node
// STATIC_MARKUP_CHROME ONLY. Real product HTML/CSS; CDP keyboard tests native HTML
// details semantics only, never extension authorization or native control events.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createOfficialToolResources} from '../build-official-tools.mjs';

const root=resolve('.');
const out=resolve(process.argv[2]||'artifacts/sidebar-r19-layout-visual');
const widths=[300,320,360,420,520];
const scenes=[
  {name:'my',tab:'tasks'},
  {name:'my-long',tab:'tasks',state:'long'},
  {name:'my-empty',tab:'tasks',state:'empty'},
  {name:'my-running',tab:'tasks',state:'running'},
  {name:'my-cloud-open',tab:'tasks',state:'cloud-open'},
  {name:'cloud',tab:'cloud'},
  {name:'cloud-hosting-open',tab:'cloud',state:'cloud-open'},
  {name:'schedule-empty',tab:'tasks',state:'schedule-empty'},
  {name:'schedule-form',tab:'tasks',state:'schedule-form'},
  {name:'schedule-manager',tab:'tasks',state:'schedule-manager'},
  {name:'discover',tab:'local-discover'},
  {name:'discover-long',tab:'local-discover',state:'long'},
  {name:'discover-empty',tab:'local-discover',state:'empty'},
  {name:'discover-error',tab:'local-discover',state:'error'},
  {name:'workflow',tab:'workflow'},
  {name:'workflow-settings',tab:'workflow',state:'settings'},
  {name:'workflow-approval',tab:'workflow',state:'approval'},
  {name:'workflow-result',tab:'workflow',state:'result'},
  {name:'workflow-steps',tab:'workflow',state:'steps'},
  {name:'workflow-running',tab:'workflow',state:'running'},
  {name:'workflow-manage',tab:'workflow',state:'manage'},
  {name:'develop',tab:'develop'},
  {name:'develop-local',tab:'develop',local:true},
  {name:'develop-local-loading',tab:'develop',local:true,state:'loading'},
  {name:'develop-details',tab:'develop',details:true},
  {name:'develop-error',tab:'develop',state:'error'},
  {name:'develop-install',tab:'develop',local:true,state:'install'},
  {name:'develop-remote',tab:'develop',state:'remote'},
  {name:'tools',tab:'tools'},
  {name:'tools-empty',tab:'tools',state:'empty'},
  {name:'tools-import',tab:'tools',state:'import'},
  {name:'tools-update',tab:'tools',state:'update'},
  {name:'tools-installed',tab:'tools',state:'installed'},
  {name:'tools-open',tab:'tools',state:'open'},
  {name:'tools-error',tab:'tools',state:'error'},
  {name:'debug',tab:'debug'},
  {name:'debug-long',tab:'debug',state:'long'}
];
// One combined expansion/long-text case per formal Tab, rather than a Cartesian
// product of every disclosure and state. Catalog is the Discover detail subview.
scenes.push(...['tasks','local-discover','catalog','workflow','develop','tools','cloud','debug'].map(tab=>({
  name:tab+'-details-long',tab,allDetails:true,longContent:true,
  ...(tab==='workflow'?{state:'steps'}:{})
})),
  {name:'tools-cookie-open',tab:'tools',cookie:true},
  {name:'develop-collapsed',tab:'develop',closedDetails:true},
  {name:'develop-single-open',tab:'develop',singleDetail:'developer-results-panel'}
);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const profile=await mkdtemp(join(tmpdir(),'sidebar-r19-static-'));
let chrome,server,socket,port,seq=0;
const pending=new Map();
function cdp(method,params={}){
  const id=++seq;
  return new Promise((ok,fail)=>{
    const timeout=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method))},20000);
    pending.set(id,{ok(v){clearTimeout(timeout);ok(v)},fail(e){clearTimeout(timeout);fail(e)}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error('Evaluate: '+JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function connect(){
  let debugPort;
  for(let i=0;i<100;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited '+chrome.exitCode);
    try{debugPort=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(debugPort>0)break}catch{}
    await sleep(100);
  }
  if(!debugPort)throw Error('Chrome debug port unavailable');
  const tabs=await (await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json();
  const page=tabs.find(x=>x.type==='page');
  if(!page?.webSocketDebuggerUrl)throw Error('No inspectable Chrome page');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const msg=JSON.parse(event.data),call=msg.id&&pending.get(msg.id);
    if(!call)return;
    pending.delete(msg.id);
    if(msg.error)call.fail(Error(msg.error.message));else call.ok(msg.result);
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
}

// Test-only fixture: visibility changes and representative rows, never a native MV3 claim.
function setupScene(scene,officialReleases){
  // Restore the real markup's text and open/hidden state between samples. Long
  // titles change text nodes only: permission labels and controls keep their DOM.
  const originals=globalThis.__sidebarStaticOriginals??=new Map();
  for(const [node,value] of originals){
    if(value.kind==='details'){node.open=value.open;node.hidden=value.hidden;}
    else if(value.kind==='value')node.value=value.text;
    else node.textContent=value.text;
  }
  for(const details of document.querySelectorAll('details')){
    if(!originals.has(details))originals.set(details,{kind:'details',open:details.open,hidden:details.hidden});
  }
  const active=scene.tab;
  for(const item of document.querySelectorAll('[data-workbench-page]'))
    item.hidden=item.dataset.workbenchPage!==active;
  for(const tab of document.querySelectorAll('[data-workbench-tab]'))
    tab.setAttribute('aria-selected',String(tab.dataset.workbenchTab===(['local-discover','catalog'].includes(active)?'discover':active==='tasks'?'tasks':active)));
  const dock=document.querySelector('#workspace-dock');
  dock.hidden=['local-discover','catalog','workflow','tools','cloud','debug'].includes(active);
  document.querySelector('#tab-debug').hidden=active!=='debug';
  document.querySelector('#cloud-hosting').open=scene.state==='cloud-open';
  const scheduled=scene.state?.startsWith('schedule-')||false;
  document.querySelector('.tasks-surface').hidden=scheduled;
  document.querySelector('#scheduled-panel').hidden=!scheduled;
  document.querySelector('#schedule-list-view').hidden=scene.state!=='schedule-empty';
  document.querySelector('#schedule-form').hidden=scene.state!=='schedule-form';
  document.querySelector('#schedule-task-manager').hidden=scene.state!=='schedule-manager';
  document.querySelector('#schedule-host-status').textContent='静态示例 · 已检查运行宿主';
  document.querySelector('#schedule-plan-list').textContent='静态示例 · 尚无定时计划';
  if(scheduled)dock.hidden=true;
  document.querySelector('#local-install-review').hidden=scene.state!=='install';
  document.querySelector('#local-install-summary').textContent=scene.state==='install'?'静态示例 · 当前候选固定版本，不执行安装':'';
  document.querySelector('#local-install-warning').textContent=scene.state==='install'?'静态示例 · 请确认名称和固定版本':'';
  document.querySelector('#page-component-remote').hidden=scene.state!=='remote';
  document.querySelector('#page-component-remote-status').textContent=scene.state==='remote'?'静态示例 · 请确认固定的 HTTPS 组件依赖':'';

  for(const d of document.querySelectorAll('.dock-actions'))
    d.hidden=d.id!==(active==='tasks'?'task-dock':active==='develop'?'develop-dock':'workflow-dock');
  const manual=document.querySelector('#manual-source-editor');
  const local=document.querySelector('#local-project-tools');
  manual.hidden=Boolean(scene.local);
  local.hidden=!scene.local;
  const sw=document.querySelector('#local-project-mode');
  sw.checked=Boolean(scene.local);
  document.querySelector('#developer-source-switch').dataset.mode=scene.local?'local':'manual';
  for(const key of ['developer-results-panel','page-preview-tools','script-library-tools'])
    document.getElementById(key).open=Boolean(scene.details);
  // Static-only states; never dispatches trusted Run/Stop, install, permission, or network events.
  const taskList=document.querySelector('#task-installed-cards');
  taskList.replaceChildren();
  document.querySelector('#task-selected-workspace').hidden=scene.tab==='tasks'&&scene.state==='empty';
  const taskStatus=document.querySelector('#task-status');
  taskStatus.textContent=scene.tab==='tasks'&&scene.state==='running'?'静态示例 · 正在运行…':
    scene.tab==='tasks'&&scene.state==='error'?'静态示例 · 当前网页不可用':'';
  taskStatus.dataset.state=scene.state==='error'?'error':'';
  document.querySelector('#task-run').disabled=scene.tab==='tasks'&&scene.state==='running';
  document.querySelector('#task-stop').disabled=scene.state!=='running';
  if(scene.tab==='tasks'&&scene.state==='empty'){
    const empty=document.createElement('p');empty.className='hint';
    empty.textContent='还没有安装任务。';taskList.append(empty);
  }else{
    for(const value of ['获取网页标题','读取表格并保存结果','检查网页状态']){
      const group=document.createElement('div');group.className='task-card-group';
      const btn=document.createElement('button');btn.className='task-card';btn.type='button';
      const icon=document.createElement('span');icon.className='task-card-icon';icon.textContent='◈';
      const label=document.createElement('span');label.className='task-card-copy';
      const name=document.createElement('strong');
      name.textContent=scene.state==='long'?value.repeat(7):value;
      const desc=document.createElement('small');desc.textContent='仅用于静态布局验证的示例说明';
      label.append(name,desc);btn.append(icon,label);group.append(btn);taskList.append(group);
    }
  }
  const discover=document.querySelector('#local-discover-cards');
  discover.replaceChildren();
  const discoverStatus=document.querySelector('#local-discover-status');
  discoverStatus.textContent=scene.tab==='local-discover'&&scene.state==='error'?'静态示例 · 无法读取本地任务':'';
  if(scene.tab==='local-discover'&&scene.state==='empty'){
    const empty=document.createElement('p');empty.className='local-discovery-empty';
    empty.textContent='当前筛选下没有任务。';discover.append(empty);
  }else{
    for(const value of ['获取网页标题','网页表单演示','有较长标题的自动化任务名称','网页图片数量统计']){
      const item=document.createElement('button');item.className='local-discovery-card';item.type='button';
      const copy=document.createElement('span');copy.className='local-discovery-copy';
      const title=document.createElement('strong');title.textContent=scene.state==='long'?value.repeat(9):value;
      const desc=document.createElement('small');desc.textContent='静态示例 · 验证紧凑列表与长文本换行';
      copy.append(title,desc);item.append(copy);discover.append(item);
    }
  }
  const editor=document.querySelector('#workflow-editor');
  editor.dataset.viewState='empty';
  const editing=scene.tab==='workflow'&&['steps','running'].includes(scene.state);
  document.querySelector('#workflow-dock').dataset.empty=String(!editing);
  if(editing)dock.hidden=false;
  dock.dataset.stopOnly=String(scene.state==='running');
  document.querySelector('#task-stop').disabled=!(scene.tab==='tasks'&&scene.state==='running');
  document.querySelector('#workflow-stop').disabled=!(scene.tab==='workflow'&&scene.state==='running');
  if(editing)editor.dataset.viewState='editing';
  document.querySelector('#workflow-plan-panel').hidden=!editing;
  document.querySelector('#workflow-params-panel').hidden=!editing;
  document.querySelector('#workflow-steps').replaceChildren();
  if(editing){
    const step=document.createElement('details');step.className='workflow-step od-disclosure';step.open=true;
    const summary=document.createElement('summary');summary.textContent='1. 填写内容 · 已采用 AI 计划的静态编辑示例';
    const body=document.createElement('div');body.className='workflow-step-body';
    const field=document.createElement('label');field.className='workflow-field';field.textContent='定位目标';
    const input=document.createElement('input');input.value='表单中的内容输入框';field.append(input);
    const actions=document.createElement('div');actions.className='workflow-step-actions';
    for(const text of ['上移','下移','删除']){const b=document.createElement('button');b.type='button';b.textContent=text;actions.append(b);}
    body.append(field,actions);step.append(summary,body);document.querySelector('#workflow-steps').append(step);
    document.querySelector('#workflow-step-count').textContent='1 步';
  }

  document.querySelector('#workflow-manage-panel').hidden=scene.state!=='manage';
  for(const d of document.querySelectorAll('#workflow-manage-panel details'))d.open=scene.state==='manage';
  document.querySelector('#workflow-ai-approval').hidden=scene.state!=='approval';
  document.querySelector('#workflow-ai-approval-scope').textContent=scene.state==='approval'?'静态示例 · 此状态仅验证许可提示尺寸，不提交任何资料':'';
  document.querySelector('#workflow-result-panel').hidden=scene.state!=='result';
  document.querySelector('#workflow-output').textContent=scene.state==='result'?'静态示例 · 执行结果预览':'尚未运行';
  document.querySelector('#workflow-provider-settings').open=scene.state==='settings';
  for(const id of ['debug-pairing','debug-connection','debug-reconcile','debug-slot'])document.getElementById(id).textContent=scene.tab==='debug'&&scene.state==='long'?'静态长状态：等待可信运行宿主连接并完成持久对账':'未检测';
  const devStatus=document.querySelector('#script-status');
  devStatus.textContent=scene.tab==='develop'&&scene.state==='error'?'静态示例 · 网页运行环境不可用':'';
  devStatus.dataset.state=scene.state==='error'?'error':'';
  const localStatus=document.querySelector('#local-project-status');
  localStatus.textContent=scene.tab==='develop'&&scene.state==='loading'?'静态示例 · 正在连接本机项目…':'';
  localStatus.dataset.state=scene.state==='loading'?'loading':'';
  document.querySelector('#local-project-refresh').disabled=scene.state==='loading';
  const toolListView=document.querySelector('#sidebar-tool-list-view');
  const toolDisplay=document.querySelector('#sidebar-tool-display');
  toolListView.hidden=scene.tab==='tools'&&scene.state==='open';
  toolDisplay.hidden=scene.state!=='open';
  const toolFrame=document.querySelector('#sidebar-tool-frame');
  toolFrame.replaceChildren();
  if(scene.tab==='tools'&&scene.state==='open'){
    document.querySelector('#sidebar-tool-title').textContent='网页阅读目录';
    const frame=document.createElement('iframe');frame.className='sidebar-tool-iframe';
    frame.title='静态展示框架 · 不运行工具';frame.setAttribute('sandbox','');
    toolFrame.append(frame);
  }
  const toolImport=document.querySelector('#sidebar-tool-import');
  toolImport.hidden=!(scene.tab==='tools'&&['import','update'].includes(scene.state));
  document.querySelector('#sidebar-tool-preview').hidden=toolImport.hidden;
  document.querySelector('#sidebar-tool-update').hidden=scene.state!=='update';
  document.querySelector('#sidebar-tool-preview-title').textContent='静态示例 · 阅读目录';
  document.querySelector('#sidebar-tool-preview-description').textContent='验证导入与更新审阅内容的换行、内边距和控件尺寸。';
  document.querySelector('#sidebar-tool-preview-capabilities').textContent='当前网页读取 · 用户授权后执行';
  const installedList=document.querySelector('#sidebar-tool-list');
  installedList.replaceChildren();
  if(scene.tab==='tools'&&scene.state==='installed'){
    for(const title of ['网页笔记','阅读目录 · 长标题用于窄屏换行排版检查']){
      const row=document.createElement('div');row.className='sidebar-tool-row';
      const open=document.createElement('button');open.type='button';open.className='sidebar-tool-item';
      const copy=document.createElement('span');copy.className='sidebar-tool-item-copy';
      const strong=document.createElement('strong');strong.textContent=title;
      const small=document.createElement('small');small.textContent='静态示例 · 已安装工具';
      copy.append(strong,small);open.append(copy);
      open.setAttribute('aria-label','打开'+title);
      row.append(open);
      for(const [cls,label,icon] of [
        ['sidebar-tool-site od-icon-button','网站开关','◉'],
        ['sidebar-tool-list-remove od-icon-button','卸载工具','×'],
        ['sidebar-tool-list-tab od-icon-button','新标签页打开','↗']
      ]){
        const action=document.createElement('button');action.type='button';action.className=cls;
        action.textContent=icon;action.title=label;action.setAttribute('aria-label',label);
        row.append(action);
      }
      installedList.append(row);
    }
  }
  const officialRoot=document.querySelector('#sidebar-tool-official-catalog');
  officialRoot.replaceChildren();
  // Static markup only: representative catalog rows, never an installation.
  for(const release of officialReleases){
    const row=document.createElement('div');row.className='sidebar-tool-official od-surface';
    row.dataset.officialToolId=release.toolId;
    const title=document.createElement('strong');title.textContent=release.packageTitle;
    const version=document.createElement('span');version.textContent='v'+release.version;
    const button=document.createElement('button');button.type='button';button.className='od-button';
    button.dataset.officialInstall=release.toolId;button.textContent='安装';
    row.append(title,version,button);officialRoot.append(row);
  }
  document.querySelector('#sidebar-tool-empty').hidden=scene.state!=='empty';
  const toolStatus=document.querySelector('#sidebar-tool-status');
  toolStatus.hidden=scene.state!=='error';
  toolStatus.dataset.state=scene.state==='error'?'error':'';
  toolStatus.textContent=scene.state==='error'?'静态示例 · 工具状态无法读取':'';
  const panel=document.querySelector('[data-workbench-page="'+active+'"]');
  if(scene.allDetails){
    if(active==='tasks')document.querySelector('#task-history-panel').hidden=false;
    if(active==='workflow')document.querySelector('#workflow-manage-panel').hidden=false;
    if(active==='cloud')document.querySelector('#cloud-request-detail').hidden=false;
    for(const details of panel.querySelectorAll('details'))details.open=true;
  }
  if(scene.cookie)for(const details of panel.querySelectorAll('#trusted-cookie-panel,#trusted-cookie-panel details'))details.open=true;
  if(scene.closedDetails||scene.singleDetail){
    for(const details of panel.querySelectorAll('details'))details.open=details.id===scene.singleDetail;
  }
  if(scene.longContent){
    const longTitle='长中文标题用于验证窄侧栏换行与权限信息仍然可读'.repeat(5);
    const longUrl='https://example.invalid/'+('very-long-fixed-revision-path/').repeat(12)+'?revision='+('a'.repeat(96));
    const json=JSON.stringify({title:longTitle,url:longUrl,result:{revision:'f'.repeat(64),description:longTitle}},null,2);
    for(const summary of panel.querySelectorAll('details > summary')){
      const node=[...summary.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim());
      if(!node)continue;
      if(!originals.has(node))originals.set(node,{kind:'text',text:node.textContent});
      node.textContent=originals.get(node).text+' · '+longTitle;
    }
    for(const node of panel.querySelectorAll('pre,textarea,input[type="url"]')){
      if(!node.getClientRects().length)continue;
      const value=node.tagName!=='PRE';
      if(!originals.has(node))originals.set(node,{kind:value?'value':'text',text:value?node.value:node.textContent});
      if(value)node.value=node.type==='url'?longUrl:json;
      else node.textContent=json;
    }
  }
  document.querySelector('#workspace-content').scrollTop=scene.details?230:0;
  return true;
}
function measureScene(scene){
  const get=q=>document.querySelector(q);
  const radius=q=>{const el=get(q);return el?getComputedStyle(el).borderTopLeftRadius:null};
  const box=q=>{const e=get(q);if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
  const content=get('#workspace-content');
  const panel=get('[data-workbench-page="'+scene.tab+'"]');
  const metrics={
    viewport:{width:innerWidth,height:innerHeight},
    coarsePointer:matchMedia('(pointer:coarse)').matches,
    documentOverflow:document.documentElement.scrollWidth>innerWidth+1,
    contentOverflow:content.scrollWidth>content.clientWidth+1,
    panelOverflow:panel.scrollWidth>panel.clientWidth+1,
    activePanel:scene.tab,
    corners:{},
    developGaps:[],
    disclosureHeaders:[],
    disclosureBodies:[],
    iconButtons:[],
    dockOverlap:false
  };
  // Measure every rendered direct summary, including content below the fold.
  // A hidden provider summary is a separate settings subview, not a header.
  const rendered=el=>el.getClientRects().length>0&&getComputedStyle(el).visibility==='visible';
  const border=style=>['Top','Right','Bottom','Left'].map(side=>({
    width:parseFloat(style['border'+side+'Width']),style:style['border'+side+'Style'],color:style['border'+side+'Color']
  }));
  const radii=style=>['TopLeft','TopRight','BottomRight','BottomLeft'].map(corner=>parseFloat(style['border'+corner+'Radius']));
  metrics.disclosureHeaders=[...panel.querySelectorAll('details > summary')].filter(rendered).map((summary,index)=>{
    const details=summary.parentElement,style=getComputedStyle(summary),outer=getComputedStyle(details);
    const r=summary.getBoundingClientRect(),d=details.getBoundingClientRect();
    const title=summary.textContent.replace(/\s+/g,' ').trim();
    const textRange=document.createRange();textRange.selectNodeContents(summary);
    const textRects=[...textRange.getClientRects()];
    return {id:details.id||details.className+'#'+index,component:details.classList.contains('od-disclosure'),
      title:title.slice(0,160),titleLength:title.length,titleTruncated:title.length>160,
      clientWidth:summary.clientWidth,scrollWidth:summary.scrollWidth,width:r.width,
      scrollOverflow:summary.scrollWidth-summary.clientWidth,
      textRectCount:textRects.length,textRects:textRects.slice(0,8).map(rect=>({left:rect.left,right:rect.right,width:rect.width,top:rect.top,bottom:rect.bottom})),
      fontFamily:style.fontFamily,letterSpacing:style.letterSpacing,
      flat:details.classList.contains('od-disclosure--flat'),open:details.open,
      wrapping:{whiteSpace:style.whiteSpace,wordBreak:style.wordBreak,overflowWrap:style.overflowWrap,lineBreak:style.lineBreak,
        children:[...summary.children].map(child=>{const s=getComputedStyle(child);return {whiteSpace:s.whiteSpace,wordBreak:s.wordBreak,overflowWrap:s.overflowWrap,lineBreak:s.lineBreak,font:s.font,flex:s.flex};})},
      height:r.height,minHeight:parseFloat(style.minHeight),fontSize:parseFloat(style.fontSize),fontWeight:parseInt(style.fontWeight,10),
      paddingTop:parseFloat(style.paddingTop),paddingRight:parseFloat(style.paddingRight),
      paddingBottom:parseFloat(style.paddingBottom),paddingLeft:parseFloat(style.paddingLeft),
      padding:['Top','Right','Bottom','Left'].map(side=>parseFloat(style['padding'+side])),
      border:border(style),radius:radii(style),containerBorder:border(outer),containerRadius:radii(outer),
      left:r.left,right:r.right,containerLeft:d.left,containerRight:d.right,
      overflow:summary.scrollWidth>summary.clientWidth+1};
  });
  // Bounded body regression: only these direct children, never every descendant.
  // The nested task-management row also exercises the flat component's 0px inset.
  metrics.disclosureBodies=[...panel.querySelectorAll('#task-installed-detail,.task-tools .row,#cloud-clients > .cloud-privacy-note')]
    .filter(child=>child.tagName!=='SUMMARY'&&child.parentElement.matches('details.od-disclosure')&&rendered(child))
    .map((child,index)=>{
      const details=child.parentElement,style=getComputedStyle(child),outer=getComputedStyle(details);
      const r=child.getBoundingClientRect(),d=details.getBoundingClientRect();
      // Measure from the inside of the component border, so unexpected container
      // padding cannot disguise an incorrect public body inset.
      const innerLeft=d.left+parseFloat(outer.borderLeftWidth),innerRight=d.right-parseFloat(outer.borderRightWidth);
      return {id:child.id||child.className+'#'+index,parent:details.id||details.className,
        kind:child.id==='task-installed-detail'?'task-permissions':child.classList.contains('row')?'task-actions':'cloud-privacy',
        flat:details.classList.contains('od-disclosure--flat'),marginLeft:parseFloat(style.marginLeft),marginRight:parseFloat(style.marginRight),
        left:r.left,right:r.right,width:r.width,innerLeft,innerRight,leftInset:r.left-innerLeft,rightInset:innerRight-r.right,
        containerPaddingLeft:parseFloat(outer.paddingLeft),containerPaddingRight:parseFloat(outer.paddingRight)};
    });
  if(scene.closedDetails||scene.singleDetail){
    metrics.developerOpenDetails=[...panel.querySelectorAll('details[open]')].filter(rendered).map(el=>el.id);
  }
  const dock=get('#workspace-dock');
  if(!dock.hidden)metrics.dockOverlap=content.getBoundingClientRect().bottom>dock.getBoundingClientRect().top+1;
  if(metrics.panelOverflow||metrics.contentOverflow){
    const bounds=panel.getBoundingClientRect();
    metrics.overflowOffenders=[...panel.querySelectorAll('*')].filter(el=>el.getClientRects().length).map(el=>{
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      return {id:el.id,tag:el.tagName.toLowerCase(),className:typeof el.className==='string'?el.className.slice(0,75):'',
        left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),
        clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,overflowX:s.overflowX};
    }).filter(x=>x.right>bounds.right+1||x.left<bounds.left-1).sort((a,b)=>b.right-a.right).slice(0,15);
  }
  {
    metrics.iconButtons=[...panel.querySelectorAll('.od-icon-button,.workflow-icon-button,.workflow-send-button')].filter(el=>el.getClientRects().length>0).map(el=>{
      const r=el.getBoundingClientRect();
      return {width:r.width,height:r.height,radius:getComputedStyle(el).borderTopLeftRadius,
        label:el.getAttribute('aria-label'),title:el.getAttribute('title')};
    });
  }

  const groups=[...panel.querySelectorAll('.od-action-group,.workflow-actions,.workflow-step-actions,.workflow-new-review-actions,.schedule-actions,.debug-actions,.local-install-review>.row,.workflow-composer-actions,.schedule-source-row')];
  if(!dock.hidden)groups.push(...dock.querySelectorAll('.dock-buttons'));
  metrics.actionGroups=groups.filter(e=>e.getClientRects().length).map(e=>{
    const r=e.getBoundingClientRect(),style=getComputedStyle(e);
    const buttons=[...e.children].filter(b=>b.tagName==='BUTTON'&&b.getClientRects().length).map(b=>{
      const q=b.getBoundingClientRect();return {id:b.id,text:b.textContent.trim(),top:q.top,center:q.top+q.height/2,left:q.left,right:q.right,width:q.width,height:q.height};
    });
    const rows=[];
    for(const b of buttons){let row=rows.find(row=>Math.abs(row.center-b.center)<1);if(!row){row={center:b.center,left:b.left,right:b.right};rows.push(row);}row.left=Math.min(row.left,b.left);row.right=Math.max(row.right,b.right);}
    return {className:e.className,gap:parseFloat(style.columnGap),left:r.left+parseFloat(style.paddingLeft)+parseFloat(style.borderLeftWidth),right:r.right-parseFloat(style.paddingRight)-parseFloat(style.borderRightWidth),rows,buttons};
  });
  if(scene.tab==='tasks')metrics.corners.taskCard=radius('.task-card-group');
  if(scene.tab==='local-discover'){
    metrics.corners.import=radius('#local-discover-open-catalog');
    metrics.corners.filter=radius('.local-discovery-filters button');
    metrics.corners.filterGroup=radius('.local-discovery-filters');
    metrics.corners.list=radius('.local-discovery-list');
  }
  if(scene.tab==='workflow'){
    metrics.corners.card=radius('.workflow-card');
    metrics.corners.icon=radius('.workflow-icon-button');
  }
  if(scene.tab==='tools'){
    metrics.corners.card=radius('.sidebar-tool-official');
    metrics.corners.install=radius('[data-official-install="reading-toc"]');
  }
  if(scene.tab==='debug'){
    metrics.corners.card=radius('.debug-metrics');
    metrics.corners.detail=radius('.debug-detail');
  }
  if(scene.tab==='develop'){
    metrics.corners.page=radius('#developer-target-detail');
    metrics.corners.editor=radius('#script-source');
    const target=box('.developer-target');
    const switchBox=box('.developer-source-switch');
    const source=box(scene.local?'#local-project-tools':'#manual-source-editor');
    metrics.developGaps=[Math.round(switchBox.top-target.bottom),Math.round(source.top-switchBox.bottom)];
    const children=[...get('.developer-editor').children].filter(e=>!e.hidden&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).position!=='absolute');
    const layout=children.map(e=>e.getBoundingClientRect());
    metrics.developGaps.push(...layout.slice(1).map((r,i)=>Math.round(r.top-layout[i].bottom)));
    // Keep the historical developer metrics key while using the shared contract.
    metrics.developerDisclosureHeaders=metrics.disclosureHeaders;
    if(!scene.local){
      const label=box('.page-component-label'),choices=box('.page-component-choices');
      metrics.codeType={
        inline:Math.abs((label.top+label.height/2)-(choices.top+choices.height/2))<=1,
        segments:[...get('.page-component-choices').querySelectorAll('label')].map(el=>({
          height:el.getBoundingClientRect().height,fontSize:parseFloat(getComputedStyle(el).fontSize)
        }))
      };
    }
  }
  return metrics;
}
function validate(scene,width,m){
  if(m.viewport.width!==width||m.viewport.height!==700)throw Error('Unexpected viewport '+JSON.stringify(m));
  if(m.documentOverflow||m.contentOverflow||m.panelOverflow)throw Error('Horizontal overflow '+scene.name+' '+width+'px '+JSON.stringify(m));
  if(m.dockOverlap)throw Error('Footer obscures content '+scene.name+' '+width+'px');
  for(const group of m.actionGroups){
    if(group.buttons.some(b=>b.height<33.5))throw Error('Undersized action '+scene.name+' '+width+'px '+JSON.stringify(group));
    // The schedule creation footer intentionally starts at the leading edge.
    // All other action groups must keep their existing trailing alignment contract.
    const leading=scene.name==='schedule-form'&&group.buttons.some(button=>button.id==='schedule-save');
    if(group.rows.some(row=>Math.abs(leading?row.left-group.left:row.right-group.right)>1))
      throw Error('Action row is not '+(leading?'leading':'trailing')+' aligned '+scene.name+' '+width+'px '+JSON.stringify(group));
    if(group.buttons.length>1&&group.gap!==8)throw Error('Action spacing is not 8px '+scene.name+' '+JSON.stringify(group));
  }

  if(m.codeType&&(!m.codeType.inline||m.codeType.segments.some(el=>el.height<36||el.fontSize<12)))
    throw Error('Code type label/choices must share a readable, accessible row '+scene.name+' '+width+'px');
  if(scene.tab==='tools'&&m.iconButtons.some(b=>b.width<33.5||b.height<33.5||b.radius!=='8px'||!b.label||!b.title))
    throw Error('Icon action is not 34px accessible control '+scene.name+' '+width+'px '+JSON.stringify(m.iconButtons));
  const expected={tasks:{taskCard:'12px'},'local-discover':{import:'8px',filter:'8px',filterGroup:'12px',list:'12px'},catalog:{},cloud:{},workflow:{card:'12px',icon:'8px'},develop:{page:'12px',editor:'8px'},tools:{card:'12px',install:'8px'},debug:{card:'12px',detail:'12px'}};
  // An empty task list intentionally has no card whose radius could be measured.
  if(scene.tab==='tasks'&&scene.state==='empty')delete expected.tasks.taskCard;
  for(const [key,value] of Object.entries(expected[scene.tab])){
    if(m.corners[key]!==value)throw Error('Radius mismatch '+scene.name+' '+key+': '+m.corners[key]+' expected '+value);
  }
  if(scene.tab==='develop'&&m.developGaps.some((gap,index)=>Math.abs(gap-(index===0?8:12))>1))throw Error('Developer gap mismatch '+scene.name+' '+width+'px '+JSON.stringify(m.developGaps));
  for(const item of m.disclosureHeaders){
    const height=m.coarsePointer?44:item.flat?36:40;
    const fail=reason=>{throw Error('Disclosure '+reason+' '+scene.name+' '+width+'px '+JSON.stringify(item));};
    if(!item.component)fail('missing trusted component class');
    if(item.height<height-.5||item.minHeight!==height||item.fontSize!==(item.flat?12:13)||item.fontWeight!==650||
      item.padding.some((value,index)=>value!==(index%2===0?8:item.flat?0:12)))fail('typography/padding/height mismatch');
    if(item.containerBorder.some(b=>b.width!==(item.flat?0:1)||(!item.flat&&b.style!=='solid'))||
      item.containerRadius.some(value=>value!==(item.flat?0:12))||item.radius.some(value=>value!==0)||
      item.border.some((b,index)=>b.width!==(item.open&&index===2?1:0)||
        (b.width>0&&(b.style!=='solid'||b.color==='transparent'||b.color==='rgba(0, 0, 0, 0)'))))fail('border/radius mismatch');
    if(item.overflow||item.left<item.containerLeft-1||item.right>item.containerRight+1)fail('header geometry overflow');
    if(scene.tab==='develop'&&!scene.longContent&&!item.flat&&!item.open&&item.id!=='developer-target-detail'&&Math.abs(item.height-height)>1){
      fail('closed developer header has extra vertical spacing');
    }
  }
  for(const item of m.disclosureBodies){
    const inset=item.flat?0:12;
    if(item.marginLeft!==inset||item.marginRight!==inset||
      Math.abs(item.leftInset-inset)>1||Math.abs(item.rightInset-inset)>1||Math.abs(item.leftInset-item.rightInset)>1){
      throw Error('Disclosure body inset mismatch '+scene.name+' '+width+'px '+JSON.stringify(item));
    }
  }
  // Expansion fixtures must actually expose each regression target; an empty
  // measurement array cannot pass just because the affected body stayed hidden.
  if(scene.name==='tasks-details-long'){
    for(const [kind,flat] of [['task-permissions',false],['task-actions',false],['task-actions',true]]){
      if(!m.disclosureBodies.some(item=>item.kind===kind&&item.flat===flat)){
        throw Error('Missing disclosure body regression target '+scene.name+' '+kind+' flat='+flat);
      }
    }
  }
  if(scene.name==='cloud-details-long'&&!m.disclosureBodies.some(item=>item.kind==='cloud-privacy'&&!item.flat)){
    throw Error('Missing expanded Cloud privacy body regression target');
  }
  if(scene.closedDetails&&m.developerOpenDetails.length)throw Error('Developer collapsed scene still has open details');
  if(scene.singleDetail&&(m.developerOpenDetails.length!==1||m.developerOpenDetails[0]!==scene.singleDetail)){
    throw Error('Developer single expansion mismatch '+JSON.stringify(m.developerOpenDetails));
  }
}
async function keyboardDisclosure(scene,selector){
  // CDP Input activates the browser's HTML summary behavior. Extension scripts
  // are absent: this evidence cannot approve a provider, Run, install or Native.
  const prepared=await evaluate(`(()=>{
    const summary=document.querySelector(${JSON.stringify(selector)});
    if(!summary?.getClientRects().length)throw Error('Missing static keyboard summary');
    summary.__staticKeyboardEvents=[];
    if(!summary.__staticKeyboardObserver){
      summary.__staticKeyboardObserver=event=>summary.__staticKeyboardEvents.push({
        type:event.type,key:event.key??null,code:event.code??null,charCode:event.charCode??null,isTrusted:event.isTrusted
      });
      for(const type of ['keydown','keypress','keyup','click'])summary.addEventListener(type,summary.__staticKeyboardObserver);
    }
    summary.scrollIntoView({block:'center'});summary.focus();
    return {open:summary.parentElement.open};
  })()`);
  const key=async(key,code,virtualKey,modifiers=0)=>{
    // Blink activates summary on Enter keypress (charCode 13), while Space
    // activates on keyup. keyDown without text omits the required keypress;
    // Space text also supplies its keypress default action that prevents scroll.
    // Keep only the portable Windows virtual code, not a Windows value in the
    // platform-specific nativeVirtualKeyCode field on Mac.
    const text=code==='Enter'?'\r':code==='Space'?' ':'';
    const params={key,code,windowsVirtualKeyCode:virtualKey,modifiers};
    await cdp('Input.dispatchKeyEvent',{type:text?'keyDown':'rawKeyDown',...params,
      ...(text?{text,unmodifiedText:text}:{})});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',...params});
  };
  // Traverse with real CDP Tab/Shift+Tab before asserting :focus-visible;
  // programmatic focus by itself is not keyboard-focus evidence.
  await key('Tab','Tab',9,8);
  await key('Tab','Tab',9);
  const read=()=>evaluate(`(async()=>{
    // Runtime.evaluate already uses awaitPromise. Wait one rendering boundary
    // for the input default action/focus layout; never retry a missing toggle.
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const summary=document.querySelector(${JSON.stringify(selector)}),style=getComputedStyle(summary),r=summary.getBoundingClientRect();
    return {focused:document.activeElement===summary,focusVisible:summary.matches(':focus-visible'),
      outlineWidth:parseFloat(style.outlineWidth),outlineStyle:style.outlineStyle,outlineColor:style.outlineColor,
      outlineOffset:parseFloat(style.outlineOffset),top:r.top,bottom:r.bottom,left:r.left,right:r.right,
      viewportWidth:innerWidth,open:summary.parentElement.open,events:summary.__staticKeyboardEvents.slice()};
  })()`);
  const before=await read();
  if(before.open!==prepared.open)throw Error('Static Tab unexpectedly changed disclosure '+selector+' '+JSON.stringify({prepared,before}));
  if(!before.focused||!before.focusVisible||before.outlineWidth<2||['none','hidden'].includes(before.outlineStyle)||
    ['transparent','rgba(0, 0, 0, 0)'].includes(before.outlineColor)||before.outlineOffset<0||
    before.top<0||before.bottom>700||before.left<0||before.right>before.viewportWidth)throw Error('Static keyboard focus not visible '+JSON.stringify(before));
  await key('Enter','Enter',13);
  const enter=await read();
  if(!enter.focused||!enter.focusVisible||enter.open===before.open)throw Error('Static Enter did not toggle summary '+selector+' '+JSON.stringify({before,enter}));
  await key(' ','Space',32);
  const space=await read();
  if(!space.focused||space.open!==before.open||!space.focusVisible)throw Error('Static Space did not restore summary '+selector+' '+JSON.stringify({before,enter,space}));
  return {evidence:'STATIC_MARKUP_CHROME_KEYBOARD',scene:scene.name,selector,before,enter,space};
}
try{
  await mkdir(out,{recursive:true});
  const officialReleases=(await createOfficialToolResources()).catalog.apps;
  const [source,tokens,design,style,hostingStyle,timeReviewStyle]=await Promise.all([
    readFile(join(root,'src/ui/tool.html'),'utf8'),
    readFile(join(root,'src/ui/design-tokens.css'),'utf8'),
    readFile(join(root,'src/ui/design-system.css'),'utf8'),
    readFile(join(root,'src/ui/tool-shell.css'),'utf8'),
    readFile(join(root,'src/ui/cloud-hosting.css'),'utf8'),
    // scripts/prepare-public.mjs copies this first-party source to ui/time-review.css.
    readFile(join(root,'examples/sidebar-tools/time-review/src/style.css'),'utf8')
  ]);
  const sourceInputs=['src/ui/tool.html','src/ui/design-tokens.css','src/ui/design-system.css','src/ui/tool-shell.css','src/ui/cloud-hosting.css','examples/sidebar-tools/time-review/src/style.css'];
  const sha=value=>createHash('sha256').update(value).digest('hex');
  const sourceBinding=[source,tokens,design,style,hostingStyle,timeReviewStyle].map((contents,index)=>({path:sourceInputs[index],sha256:sha(contents)}));
  const html=source.replace(/<script src="tool-shell\.js"><\/script>/,'');
  if(html===source)throw Error('Expected script marker missing: refusing native JS execution in static fixture');
  server=createServer((req,res)=>{
    const name=req.url?.split('?')[0];
    if(name==='/ui/tool.html')res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html);
    else if(name==='/ui/design-tokens.css')res.writeHead(200,{'Content-Type':'text/css; charset=utf-8'}).end(tokens);
    else if(name==='/ui/design-system.css')res.writeHead(200,{'Content-Type':'text/css; charset=utf-8'}).end(design);
    else if(name==='/ui/tool-shell.css')res.writeHead(200,{'Content-Type':'text/css; charset=utf-8'}).end(style);
    else if(name==='/ui/cloud-hosting.css')res.writeHead(200,{'Content-Type':'text/css; charset=utf-8'}).end(hostingStyle);
    else if(name==='/ui/time-review.css')res.writeHead(200,{'Content-Type':'text/css; charset=utf-8'}).end(timeReviewStyle);
    else res.writeHead(404).end();
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  port=server.address().port;
  chrome=spawn(process.env.CHROME_BIN||'google-chrome',[
    '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
    '--hide-scrollbars','--no-first-run','--no-default-browser-check',
    '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
  ],{stdio:'ignore'});
  await connect();
  const nav=await cdp('Page.navigate',{url:'http://127.0.0.1:'+port+'/ui/tool.html'});
  if(nav.errorText)throw Error('Static navigation failed '+nav.errorText);
  let ready=false;
  for(let i=0;i<100;i++){
    if(await evaluate('document.readyState==="complete" && document.styleSheets.length===document.querySelectorAll("link[rel=stylesheet]").length && [...document.querySelectorAll("link[rel=stylesheet]")].every(link=>link.sheet) && !!document.querySelector("#workbench-develop")')){ready=true;break}
    await sleep(100);
  }
  if(!ready)throw Error('Real Sidebar HTML/CSS did not load in static Chrome');
  const samples=[];
  for(const width of widths){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});
    for(const scene of scenes){
      await evaluate('('+setupScene.toString()+')('+JSON.stringify(scene)+','+JSON.stringify(officialReleases)+')');
      if(scene.state==='cloud-open')await evaluate('document.querySelector("#cloud-hosting").scrollIntoView({block:"start"})');
      const m=await evaluate('('+measureScene.toString()+')('+JSON.stringify(scene)+')');
      validate(scene,width,m);
      samples.push({scene:scene.name,width,...m});
      const image=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
      await writeFile(join(out,scene.name+'-'+width+'x700.png'),Buffer.from(image.data,'base64'));
      console.log('SIDEBAR_R19_STATIC_LAYOUT_PASS',scene.name,width);
    }
  }

  // Coarse-pointer geometry only; this never claims a native touch event or zoom pass.
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  if(!await evaluate('matchMedia("(pointer:coarse)").matches'))throw Error('Coarse-pointer media emulation unavailable');
  for(const width of widths){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});
    for(const scene of scenes.filter(s=>['develop','workflow-settings','cloud-hosting-open','tools-installed','schedule-form',
      'tasks-details-long','workflow-details-long','tools-cookie-open','cloud-details-long','develop-single-open'].includes(s.name))){
      await evaluate('('+setupScene.toString()+')('+JSON.stringify(scene)+','+JSON.stringify(officialReleases)+')');
      if(scene.state==='cloud-open')await evaluate('document.querySelector("#cloud-hosting").scrollIntoView({block:"start"})');
      const m=await evaluate('('+measureScene.toString()+')('+JSON.stringify(scene)+')');validate(scene,width,m);
      if(m.actionGroups.some(g=>g.buttons.some(b=>b.height<43.5))||m.iconButtons.some(b=>b.height<43.5||b.width<43.5)||m.codeType?.segments.some(s=>s.height<43.5))throw Error('Coarse pointer target below 44px '+scene.name);
      samples.push({scene:scene.name,width,pointer:'coarse',...m});
      const image=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
      await writeFile(join(out,scene.name+'-coarse-'+width+'x700.png'),Buffer.from(image.data,'base64'));
    }
  }
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});
  await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:700,deviceScaleFactor:1,mobile:false});
  const keyboardSamples=[];
  for(const [name,selector] of [
    ['develop-collapsed','#developer-target-detail > summary'],
    ['tools-cookie-open','#trusted-cookie-panel > summary'],
    ['tools-cookie-open','#trusted-cookie-observe-panel > summary']
  ]){
    const scene=scenes.find(s=>s.name===name);
    await evaluate('('+setupScene.toString()+')('+JSON.stringify(scene)+','+JSON.stringify(officialReleases)+')');
    keyboardSamples.push(await keyboardDisclosure(scene,selector));
  }
  // Limited media smoke samples reuse the same product HTML and geometry checks.
  for(const [name,width,features] of [
    ['tools-cookie-open',320,[{name:'prefers-color-scheme',value:'dark'}]],
    ['develop-single-open',520,[{name:'prefers-reduced-motion',value:'reduce'}]]
  ]){
    await cdp('Emulation.setEmulatedMedia',{features});
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});
    const scene=scenes.find(s=>s.name===name);
    await evaluate('('+setupScene.toString()+')('+JSON.stringify(scene)+','+JSON.stringify(officialReleases)+')');
    const media=await evaluate('('+JSON.stringify(features)+').map(f=>({name:f.name,value:f.value,matches:matchMedia("("+f.name+":"+f.value+")").matches}))');
    if(media.some(feature=>!feature.matches))throw Error('Static media emulation unavailable '+JSON.stringify(media));
    const m=await evaluate('('+measureScene.toString()+')('+JSON.stringify(scene)+')');validate(scene,width,m);
    samples.push({scene:scene.name,width,media,...m});
    const image=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
    await writeFile(join(out,scene.name+'-'+features[0].value+'-'+width+'x700.png'),Buffer.from(image.data,'base64'));
  }
  await cdp('Emulation.setEmulatedMedia',{features:[]});
  for(const item of sourceBinding)if(sha(await readFile(join(root,item.path)))!==item.sha256)throw Error('Relevant input drift '+item.path);
  await writeFile(join(out,'metrics.json'),JSON.stringify({
    evidence:'STATIC_MARKUP_CHROME',nativeExtension:false,nativeControlEvents:false,
    source:sourceInputs.join(' + '),sourceBinding,inputsStable:true,samples,keyboardSamples
  },null,2)+'\n');
  console.log('SIDEBAR_R21_STATIC_STATES_ALL_PASS '+samples.length);
}finally{
  try{socket?.close()}catch{}
  try{server?.close()}catch{}
  try{chrome?.kill('SIGTERM')}catch{}
  await sleep(350);
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
