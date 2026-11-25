import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createGeminiSite} from '../src/page/site.js';

const user=text=>'<user-query><div data-test-id="query-text">'+text+'</div></user-query>';
const assistant='<model-response><message-content><div class="markdown"><p>Answer</p></div></message-content>'+
  '<message-actions><button aria-label="Copy"></button></message-actions></model-response>';
const turn=(id,body)=>'<div class="conversation-container" id="'+id+'">'+body+'</div>';
const stopStatus='<div class="response-content"><div class="response-footer gap complete">'+
  '<response-info-line role="status">You stopped this response</response-info-line></div></div>';
const stoppedAssistant='<model-response><message-content><div class="markdown" aria-busy="true">Partial answer</div></message-content>'+
  stopStatus+'</model-response>';

function fixture(){
  const {window:win}=new JSDOM('<chat-window><section>'+turn('a123456789abcdef',user('seed')+assistant)+'</section>'+
    '<input-area-v2><rich-textarea><div class="ql-editor" role="textbox" contenteditable="true"><p><br></p></div>'+
    '<div class="ql-clipboard" contenteditable="true"></div></rich-textarea>'+
    '<button aria-label="Send message"></button></input-area-v2></chat-window>',
    {url:'https://gemini.google.com/app/test-chat'});
  const doc=win.document,editor=doc.querySelector('.ql-editor'),form=doc.querySelector('input-area-v2');
  win.HTMLElement.prototype.getClientRects=()=>[{}];
  Object.defineProperty(editor,'isContentEditable',{value:true});
  let composing=false;
  const site=createGeminiSite({doc,win,isComposing:()=>composing});
  return {site,doc,win,editor,form,history:doc.querySelector('section'),setComposing:value=>{composing=value;}};
}

test('Gemini uses the unique editor, and attachment, whitespace, IME and quota veto native actions',()=>{
  const {site,doc,editor,form,setComposing}=fixture();
  let clicks=0;form.querySelector('button').onclick=()=>{clicks++;};
  const initial=site.inspect();
  assert.equal(initial.editor,editor);assert.equal(initial.idle,true);
  editor.innerHTML='<p> </p>';assert.equal(site.inspect().draft,' ');
  assert.equal(site.prepare('queued',initial).ok,false);
  editor.innerHTML='<p><br></p>';
  setComposing(true);assert.equal(site.clearForQueue(site.inspect()).ok,false);
  setComposing(false);
  form.insertAdjacentHTML('beforeend','<file-preview>photo</file-preview>');
  assert.equal(site.inspect().rich,true);assert.equal(site.prepare('queued',initial).ok,false);
  doc.querySelector('file-preview').remove();
  form.insertAdjacentHTML('beforeend','<div role="alert">Limit reached</div>');
  assert.match(site.inspect().reason,/网站输入框有提示/);
  assert.equal(clicks,0);
});

test('Gemini requires a new exact user turn and its own completed assistant successor',()=>{
  const {site,history,win}=fixture(),before=site.inspect();
  const query=user('<h5 class="cdk-visually-hidden screen-reader-user-query-label">You said <span>Q1</span></h5>'+
    '<p class="query-text-line"> Q1 </p><p class="query-text-line">  </p><p class="query-text-line">   exact   </p>');
  history.insertAdjacentHTML('beforeend',turn('',query));
  const optimistic=history.lastElementChild;
  assert.equal(site.confirm(before,'Q1\n\n  exact  ',site.inspect()),false,'temporary Gemini turn cannot acknowledge a send');
  // Gemini discards the optimistic DOM and inserts the persisted turn.
  optimistic.outerHTML=turn('b123456789abcdef',query);
  const persisted=history.lastElementChild;
  const admitted=site.inspect(),queued='Q1\n\n  exact  ';
  assert.equal(site.confirm(before,queued,admitted),true);
  persisted.id='a123456789abcdef';
  assert.equal(site.confirm(before,queued,site.inspect()),false,'an ambiguous turn ID cannot acknowledge a send');
  persisted.id='b123456789abcdef';
  assert.equal(site.confirm(before,queued.trim(),admitted),false);
  const line=admitted.users.at(-1).querySelector('p');
  line.innerHTML=' <b>Q1</b> ';
  assert.equal(site.confirm(before,queued,site.inspect()),false,'unknown markup cannot confirm a send');
  line.textContent=' Q1 ';
  const attachment=win.document.createElement('file-preview');
  admitted.users.at(-1).append(attachment);
  assert.equal(site.confirm(before,queued,site.inspect()),false,'an attachment cannot confirm a text-only send');
  attachment.remove();
  assert.equal(admitted.idle,false,'an older complete answer cannot release the queue');
  const gate={};
  assert.equal(site.replyComplete(before,admitted.users.at(-1),admitted,gate),false);
  persisted.insertAdjacentHTML('beforeend',assistant.replace('<model-response>','<model-response aria-busy="true">'));
  assert.equal(site.replyComplete(before,admitted.users.at(-1),site.inspect(),gate),false);
  persisted.lastElementChild.removeAttribute('aria-busy');
  assert.equal(site.replyComplete(before,admitted.users.at(-1),site.inspect(),gate),true);
  win.history.replaceState({},'', '/app/other-chat');
  assert.equal(site.confirm(before,queued,site.inspect()),false);
  win.history.replaceState({},'', '/library');
  assert.equal(site.inspect().ok,false);
});

test('Gemini releases the queue after a native Stop receipt for the current persisted turn',()=>{
  const {site,history,form}=fixture();
  history.insertAdjacentHTML('beforeend',turn('b123456789abcdef',user('stopped')+stoppedAssistant));
  const reply=history.lastElementChild.querySelector('model-response');
  assert.equal(site.inspect().idle,true,'only the stale markdown aria-busy may remain');
  form.insertAdjacentHTML('beforeend','<button aria-label="Stop response"></button>');
  assert.equal(site.inspect().idle,false,'the native Stop still vetoes');
  form.lastElementChild.remove();
  reply.setAttribute('aria-busy','true');
  assert.equal(site.inspect().idle,false,'busy on the response itself still vetoes');
  reply.removeAttribute('aria-busy');
  reply.querySelector('.markdown').classList.add('result-streaming');
  assert.equal(site.inspect().idle,false,'another marker on the markdown still vetoes');
});

test('Gemini rejects absent, hidden, model-authored or mismatched Stop receipts',()=>{
  const {site,history}=fixture();
  const variants=[
    turn('b123456789abcdef',user('new')+stoppedAssistant.replace(stopStatus,'')),
    turn('b123456789abcdef',user('new')+stoppedAssistant.replace('role="status"','role="status" hidden')),
    turn('b123456789abcdef',user('new')+stoppedAssistant.replace('</message-content>'+stopStatus,stopStatus+'</message-content>')),
    turn('a123456789abcdef',user('new')+stoppedAssistant),
    turn('',user('optimistic')+stoppedAssistant),
    turn('b123456789abcdef',user('other'))+turn('c123456789abcdef',stoppedAssistant),
    turn('b123456789abcdef',user('old')+stoppedAssistant)+turn('c123456789abcdef',user('new')+stoppedAssistant.replace(stopStatus,'')),
  ];
  const seed=history.innerHTML;
  for(const suffix of variants){
    history.innerHTML=seed+suffix;
    assert.equal(site.inspect().idle,false,suffix);
  }
});
