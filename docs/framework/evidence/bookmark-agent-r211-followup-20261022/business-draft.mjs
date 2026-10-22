import {readFile,writeFile} from 'node:fs/promises';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {connect,evaluate} from '../../tests/framework/sidebar-native-session.mjs';
const run=promisify(execFile),dir='artifacts/bookmark-agent-r211-followup',l=JSON.parse(await readFile(dir+'/launch.json','utf8'));
const c=await connect((await readFile(l.log,'utf8')).match(/DevTools listening on (ws:\/\/\S+)/)[1]);
const ts=(await c.send('Target.getTargets')).targetInfos,t=ts.find(x=>x.url.includes('/sidepanel.html?hostInstanceId=')),w=ts.find(x=>x.url.endsWith('/sw.js'));
const s=(await c.send('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId,ws=(await c.send('Target.attachToTarget',{targetId:w.targetId,flatten:true})).sessionId;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const click=async q=>{const p=await evaluate(c,`(()=>{const e=document.querySelector(${JSON.stringify(q)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,s);for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...p},s)};
const snap=()=>evaluate(c,`({at:Date.now(),width:innerWidth,name:document.querySelector('#bm-edit-name')?.value,url:document.querySelector('#bm-edit-url')?.value,chatDraft:document.querySelector('#od-conversation-input')?.value,chatOpen:!document.querySelector('#opendesk-conversation-dock').hidden,editor:!!document.querySelector('.bm-editor')})`,s);
const d={kind:'Unsaved real bookmark editor and Conversation drafts through actual close/reopen and physical resize; no Save'};
try{
 for(const [q,text]of [['#bm-edit-name','尚未保存的真实书签编辑草稿'],['#bm-edit-url','https://example.com/r211-unsaved-draft']]){await click(q);await c.send('Input.insertText',{text},s)}
 d.before=await snap();await click('button[aria-label="收起对话"]');d.closed=await snap();await click('button[aria-label="AI 对话"]');d.reopened=await snap();
 d.dragOut=(await run(dir+'/drag-panel',['-40'])).stdout.trim();await wait(150);d.resized=await snap();d.dragBack=(await run(dir+'/drag-panel',['40'])).stdout.trim();await wait(150);d.restored=await snap();
 d.checks={editorDraftPreserved:[d.closed,d.reopened,d.resized,d.restored].every(x=>x.name===d.before.name&&x.url===d.before.url),chatDraftPreserved:[d.closed,d.reopened,d.resized,d.restored].every(x=>x.chatDraft===d.before.chatDraft),actualCloseReopen:!d.closed.chatOpen&&d.reopened.chatOpen,actualPhysicalResize:d.resized.width===400&&d.restored.width===360};
 await click('.bm-editor-actions button:last-child');await wait(80);d.cancelled=await snap();
 d.writesAfterSetup=await evaluate(c,'globalThis.__uxWrites',ws);
 await writeFile(dir+'/t12-real-unsaved-drafts.json',JSON.stringify(d,null,2)+'\n');console.log(JSON.stringify({checks:d.checks,cancelled:!d.cancelled.editor,writes:d.writesAfterSetup.length}));
}finally{c.close()}
