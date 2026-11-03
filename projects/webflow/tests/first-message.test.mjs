import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createChatGPTTaskDiscovery} from '../../../src/native-agent/chatgpt-task-discovery.js';
import {createChatGPTBridgeSite} from '../../../src/native-agent/chatgpt-bridge-site.js';

const message=(id,text=id)=>({textContent:text,compareDocumentPosition:()=>4,
 getAttribute:key=>key==='data-chatgpt-search-message-ids'?id:
  key==='data-chatgpt-search-unit-key'?'fallback-turn-0:0:user':null});
const snapshot=()=>({ok:true,route:'new:/',users:[],assistants:[],idle:true,busy:false,
 answerComplete:false,draft:'exact prompt',rich:false});

test('first native submission survives creation of its formal route only through its observed user',()=>{
 const probe=createChatGPTTaskDiscovery(),snap=snapshot();
 assert.equal(probe.witnessSubmission(snap),true);
 snap.draft='';snap.users=[message('first-user','exact prompt')];
 assert.equal(probe.observe(snap),null); // optimistic user exists before /c/
 snap.route='c/new-conversation-12345678';snap.assistants=[message('first-answer')];
 snap.answerComplete=true;
 assert.equal(probe.observe(snap)?.user,snap.users[0]);
 assert.equal(probe.observe(snap),null);
});
test('blank-route transition cannot infer a send from history or a replaced user',()=>{
 for(const kind of ['unobserved','replaced','different','multiple','existing-route']){
  const probe=createChatGPTTaskDiscovery(),snap=snapshot();
  if(kind==='existing-route')snap.route='c/old-conversation';
  probe.witnessSubmission(snap);snap.draft='';
  if(kind!=='unobserved'){
   snap.users=[message('first-user','exact prompt')];probe.observe(snap);
  }
  if(kind==='unobserved'||kind==='replaced')snap.users=[message('history-user','exact prompt')];
  if(kind==='different')snap.users[0].textContent='different';
  if(kind==='multiple')snap.users.push(message('other-user'));
  snap.route='c/another-conversation';snap.assistants=[message('answer')];snap.answerComplete=true;
  assert.equal(probe.observe(snap),null,kind);
  assert.equal(probe.observe(snap),null,kind);
 }
});
test('real message IDs distinguish new messages with repeated ChatGPT fallback keys',()=>{
 const probe=createChatGPTTaskDiscovery(),snap=snapshot();snap.route='c/existing-conversation';
 snap.users=[message('prior-user','prior')];snap.assistants=[message('prior-answer')];snap.answerComplete=true;
 probe.witnessSubmission(snap);snap.draft='';
 snap.users.push(message('new-user','exact prompt'));snap.assistants.push(message('new-answer'));
 assert.equal(probe.observe(snap)?.user,snap.users.at(-1));
});
test('first-message binding ends at the first formal route and cannot follow another navigation',()=>{
 const probe=createChatGPTTaskDiscovery(),snap=snapshot();probe.witnessSubmission(snap);
 snap.draft='';snap.users=[message('first-user','exact prompt')];probe.observe(snap);
 snap.route='c/first-conversation';snap.busy=true;snap.idle=false;probe.observe(snap);
 snap.route='c/second-conversation';snap.busy=false;snap.idle=true;snap.answerComplete=true;
 snap.assistants=[message('answer')];
 assert.equal(probe.observe(snap),null);
});
test('a completed optimistic reply cannot execute before a formal conversation exists',()=>{
 const probe=createChatGPTTaskDiscovery(),snap=snapshot();probe.witnessSubmission(snap);
 snap.draft='';snap.users=[message('first-user','exact prompt')];
 snap.assistants=[message('first-answer')];snap.answerComplete=true;
 assert.equal(probe.observe(snap),null);
 snap.route='c/new-conversation-12345678';
 assert.equal(probe.observe(snap)?.user,snap.users[0]);
});
test('native first submission crosses the observed local-chatgpt route and composer remount before its formal route',()=>{
 const probe=createChatGPTTaskDiscovery(),snap=snapshot();probe.witnessSubmission(snap);snap.draft='';
 const provisional='pending/f752096a-83bd-41d1-a13a-476092e6aea8';
 assert.equal(probe.observe({ok:false,route:provisional}),null);
 snap.route=provisional;snap.users=[message('first-user','exact prompt')];
 assert.equal(probe.observe(snap),null);
 assert.equal(probe.observe({ok:false,route:'c/new-conversation-12345678'}),null);
 snap.route='c/new-conversation-12345678';snap.assistants=[message('first-answer')];snap.answerComplete=true;
 assert.equal(probe.observe(snap)?.user,snap.users[0]);assert.equal(probe.observe(snap),null);
});
test('a local route without a native first submission or with a replaced local route never adopts',()=>{
 for(const kind of ['unwitnessed','different-local-route','mismatched-user','multiple-users']){
  const probe=createChatGPTTaskDiscovery(),snap=snapshot();
  if(kind!=='unwitnessed')probe.witnessSubmission(snap);snap.draft='';
  snap.route='pending/first';snap.users=[message('first-user',kind==='mismatched-user'?'wrong':'exact prompt')];
  probe.observe(snap);
  if(kind==='different-local-route'){snap.route='pending/other';probe.observe(snap);}
  if(kind==='multiple-users')snap.users.push(message('extra-user'));
  snap.route='c/new-conversation-12345678';snap.assistants=[message('answer')];snap.answerComplete=true;
  assert.equal(probe.observe(snap),null,kind);
 }
});
test('site inspects the native composer on supported blank ChatGPT routes only',()=>{
 const {document,window}=parseHTML('<html><body><form><textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button></form></body></html>');
 for(const node of document.querySelectorAll('textarea,button'))node.getClientRects=()=>[{}];
 window.getComputedStyle=()=>({display:'block',visibility:'visible'});
 for(const path of ['/','/g/g-p-abc123/project','/g/g-p-abc123-opendesk-browser','/settings','/share/abc123',
  '/c/local-chatgpt%3Af752096a-83bd-41d1-a13a-476092e6aea8']){
  const win={location:{origin:'https://chatgpt.com',pathname:path,search:'',href:'https://chatgpt.com'+path},getComputedStyle:window.getComputedStyle};win.top=win;
  const view=createChatGPTBridgeSite({doc:document,win}).inspect();
  assert.equal(view.ok,!path.startsWith('/settings')&&!path.startsWith('/share'),path);
  if(view.ok)assert.equal(view.route,path.includes('local-chatgpt')?'pending/f752096a-83bd-41d1-a13a-476092e6aea8':'new:'+path);
 }
});

test('project new chat excludes CSS-hidden retained history and binds only its new visible user',()=>{
 const {document}=parseHTML('<html><body><section style="display:none"><div data-chatgpt-search-unit-key="old:user" data-chatgpt-search-message-ids="old-user">old prompt</div><div data-content-search-unit-key="old:assistant" data-talvt-turn-state="complete">old reply</div></section><form><textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button></form><main></main></body></html>');
 for(const node of document.querySelectorAll('textarea,button'))node.getClientRects=()=>[{}];
 const win={location:{origin:'https://chatgpt.com',pathname:'/g/g-p-project/project',search:''},
  getComputedStyle:node=>({display:node.style?.display||'block',visibility:node.style?.visibility||'visible'})};win.top=win;
 const site=createChatGPTBridgeSite({doc:document,win}),probe=createChatGPTTaskDiscovery();
 document.querySelector('textarea').value='exact prompt';
 const blank=site.inspect();
 assert.equal(blank.users.length,0,'the project page retains a hidden old conversation');
 assert.equal(blank.assistants.length,0);assert.equal(blank.idle,true);
 assert.equal(probe.witnessSubmission(blank),true);
 const user=document.createElement('div');user.setAttribute('data-chatgpt-search-unit-key','fallback-turn-0:0:user');
 user.setAttribute('data-chatgpt-search-message-ids','new-user');user.textContent='exact prompt';
 document.querySelector('main').append(user);document.querySelector('textarea').value='';
 assert.equal(probe.observe(site.inspect()),null);
 win.location.pathname='/c/new-project-conversation';
 const answer=document.createElement('div');answer.setAttribute('data-content-search-unit-key','new:assistant');
 answer.setAttribute('data-talvt-turn-state','complete');answer.textContent='new reply';document.querySelector('main').append(answer);
 const discovered=probe.observe(site.inspect());assert.equal(discovered?.user,user);
 assert.equal(discovered?.answer,answer);assert.equal(probe.observe(site.inspect()),null);
});
