#!/usr/bin/env node
// STATIC_SOURCE_CHROME: renders the actual official Quick Notes HTML/CSS without
// installing an extension or executing imported tool JS. No native PASS claim.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';

const widths=[160,180,210,220,221,300,320,360,420,520,760,1100];
const states=['empty','long','expanded','confirm'];
const sourceRoot=resolve(process.env.OPENDESK_SOURCE_ROOT||'.');
const output=resolve(process.argv[2]||'artifacts/quick-notes-layout-visual');
const toolRoot=join(sourceRoot,'examples/sidebar-tools/quick-notes');
const [css,html,image]=await Promise.all([
  readFile(join(toolRoot,'src/style.css'),'utf8'),
  readFile(join(toolRoot,'src/index.html'),'utf8'),
  readFile(join(toolRoot,'assets/mark.png'))
]);
assert.match(html,/class="notes-app"/);
assert.match(css,/\.notes-app\{/);
assert(!/@import\b|url\(\s*['"]?\s*https?:/i.test(css),'No remote stylesheet');
const fragment=html.replace('{{asset:assets/mark.png}}','data:image/png;base64,'+image.toString('base64'));
assert(!fragment.includes('{{asset:'),'Unresolved bundled asset');
const pageHtml='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body>'+fragment+'</body></html>';
const profile=await mkdtemp(join(tmpdir(),'opendesk-quick-notes-layout-'));
let chrome,socket,seq=0;
const pending=new Map();
function cdp(method,params={}){
  const id=++seq;
  return new Promise((ok,fail)=>{
    const timeout=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method));},20000);
    pending.set(id,{ok(value){clearTimeout(timeout);ok(value);},fail(error){clearTimeout(timeout);fail(error);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const value=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(value.exceptionDetails)throw Error('Chrome evaluation failed: '+JSON.stringify(value.exceptionDetails));
  return value.result.value;
}
async function connect(){
  let debugPort=0;
  for(let i=0;i<100;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited '+chrome.exitCode);
    try{debugPort=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(debugPort>0)break;}
    catch{}
    await new Promise(done=>setTimeout(done,100));
  }
  if(!debugPort)throw Error('Chrome debugging port unavailable');
  const targets=await (await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json();
  const target=targets.find(x=>x.type==='page');
  if(!target?.webSocketDebuggerUrl)throw Error('Cannot inspect Chrome page');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',fail,{once:true});});
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data),callback=message.id&&pending.get(message.id);
    if(!callback)return;
    pending.delete(message.id);
    if(message.error)callback.fail(Error(message.error.message));else callback.ok(message.result);
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
}
function setFixtureState(state){
  const el=id=>document.getElementById(id);
  el('page-summary').textContent=state==='empty'?'离线笔记：仍可编辑保存':'目标网页：这是一个很长很长的中文网页标题，用来测试窄屏布局和完整文字换行。';
  el('page-url').hidden=state==='empty';
  el('page-url').textContent='https://www.example.com/path/long/long/中文内容/very-long-unbroken-path-name-for-overflow-regression';
  const list=el('note-list');list.replaceChildren();
  if(state!=='empty')for(const name of ['第一条网页笔记：标题非常长，用来验证多条标签的局部滚动','第二条笔记｜长中文标题','第三条笔记']){
    const button=document.createElement('button');button.type='button';button.className='note-chip';button.textContent=name;
    list.append(button);
  }
  el('note-text').value='含长段中文的已保存笔记内容与换行：'.repeat(24);
  el('attach-page').checked=state!=='empty';
  el('note-attachment').hidden=state==='empty';
  el('note-attachment').textContent='已关联：特别长的标题，用来检查附注与文本输入框保持相同左边距';
  el('note-status').hidden=state==='empty';
  el('note-status').textContent='保存成功。布局诊断状态，只读展示，不写入任何笔记';
  el('note-confirm').hidden=state!=='confirm';
  el('note-confirm-message').textContent='当前笔记有未保存的更改，需要确认是否放弃';
  document.querySelector('.task-shortcut').open=state==='expanded';
  return true;
}
function measure(){
  const el=id=>document.querySelector(id);
  const box=selector=>{const r=el(selector).getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,width:r.width,height:r.height};};
  return {
    viewport:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,
    app:box('.notes-app'),summary:box('.page-context'),heading:box('.notes-heading'),
    text:box('#note-text'),actions:box('.editor-actions'),attach:box('.page-attach'),
    delete:box('#delete-note'),save:box('#save-note'),details:box('.task-shortcut'),
    noteList:box('#note-list'),noteAttachment:box('#note-attachment'),status:box('#note-status'),
    confirmation:box('#note-confirm'),confirmButtons:[...document.querySelectorAll('#note-confirm .confirm-actions button')].map(x=>{const r=x.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,width:r.width,height:r.height};}),buttons:[...document.querySelectorAll('.icon-button')].map(x=>{
      const r=x.getBoundingClientRect();return {id:x.id,width:r.width,height:r.height};
    })
  };
}
function validate(width,state,m){
  const eq=(a,b,label,tol=1)=>assert.ok(Math.abs(a-b)<=tol,label+' '+width+'/'+state+': '+a+' vs '+b);
  assert.equal(m.viewport,width,'Viewport mismatch');
  assert.ok(m.scrollWidth<=width+1,'Whole-page horizontal overflow at '+width+'/'+state+': '+m.scrollWidth);
  eq(m.app.x+12,m.text.x,'Editor left aligned with container');
  eq(m.summary.x,m.text.x,'Page summary aligned with editor');
  eq(m.text.x,m.details.x,'Advanced details aligned with editor');
  eq(m.text.x,m.actions.x,'Action bar aligned with editor');
  eq(m.text.right,m.actions.right,'Editor/action right edge');
  eq(m.text.right,m.details.right,'Editor/details right edge');
  if(state!=='empty'){
    eq(m.text.x,m.noteAttachment.x,'Attachment left edge');
    eq(m.text.x,m.status.x,'Status left edge');
  }
  if(state==='confirm'){
    eq(m.text.x,m.confirmation.x,'Inline confirmation left edge');
    assert.equal(m.confirmButtons.length,2,'Inline confirmation contains two buttons');
    eq(m.confirmButtons[0].y,m.confirmButtons[1].y,'Confirmation buttons stay on the same row');
    eq(m.confirmButtons[1].x-m.confirmButtons[0].right,8,'Confirmation button gap');
    eq(m.confirmButtons[1].right,m.confirmation.right-13,'Confirmation buttons align to card inner edge');
    for(const button of m.confirmButtons)assert.ok(button.height>=34&&button.height<=44,'Confirmation text must not wrap');
  }
  assert.ok(m.attach.height<=35,'Attach label wraps into multiple lines at '+width+'/'+state);
  assert.ok(m.save.right<=m.text.right+1&&m.delete.x>=m.text.x-1,'Editor actions out of content bounds');
  eq(m.save.right,m.text.right,'Save is anchored to the right edge');
  eq(m.save.x-m.delete.right,8,'Save/delete gap');
  for(const button of m.buttons){eq(button.width,34,button.id+' icon width');eq(button.height,34,button.id+' icon height');}
  if(width<=220)assert.ok(m.save.y>m.attach.y,'Ultra-narrow: actions should move below full-width attach label');
  else eq(m.save.y,m.attach.y,'Normal widths use one-line action bar');
  if(width>=800)assert.ok(m.app.width<=760.5,'Wide standalone editor should not stretch to viewport width');
}
try{
  await mkdir(output,{recursive:true});
  chrome=spawn(process.env.CHROME_BIN||'chromium',[
    '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run',
    '--no-default-browser-check','--hide-scrollbars','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
  ],{stdio:'ignore'});
  await connect();
  await evaluate('document.open();document.write('+JSON.stringify(pageHtml)+');document.close();true');
  let ready=false;
  for(let i=0;i<100;i++){
    if(await evaluate('document.readyState==="complete" && !!document.getElementById("note-text")')){ready=true;break;}
    await new Promise(done=>setTimeout(done,100));
  }
  if(!ready)throw Error('Actual Quick Notes HTML/CSS did not load');
  const samples=[];
  for(const width of widths){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:720,deviceScaleFactor:1,mobile:false});
    for(const state of states){
      await evaluate('('+setFixtureState.toString()+')('+JSON.stringify(state)+')');
      const value=await evaluate('('+measure.toString()+')()');
      validate(width,state,value);
      samples.push({width,state,...value});
      if([160,320,420,1100].includes(width)&&['long','expanded'].includes(state)){
        const picture=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
        await writeFile(join(output,'quick-notes-'+state+'-'+width+'.png'),Buffer.from(picture.data,'base64'));
      }
    }
    console.log('QUICK_NOTES_STATIC_LAYOUT_PASS '+width+'px '+states.length+' states');
  }
  await writeFile(join(output,'metrics.json'),JSON.stringify({
    evidence:'STATIC_SOURCE_CHROME',nativeExtension:false,userDataMutated:false,
    toolId:'quick-notes',widths,states,samples
  },null,2)+'\n');
  console.log('QUICK_NOTES_STATIC_ALL_PASS '+samples.length);
}finally{
  try{socket?.close();}catch{}
  try{chrome?.kill('SIGTERM');}catch{}
  await new Promise(done=>setTimeout(done,300));
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
