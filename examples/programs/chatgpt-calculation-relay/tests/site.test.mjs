// Minimal DOM contract fixtures running the actual serialized site module.
// No fixture is evidence of ChatGPT selector compatibility or Chrome success.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {chatgptDOM, createChatGPTControllerSite} from '../src/site.js';

// Bounded structure observed through the product's read-only inspect on the
// official site. These are synthetic contents, not real execution evidence.
function currentDOM({ids='assistant-id assistant-id', state='complete', nested=false} = {}) {
  const {window:win, document:doc} = parseHTML(`<html><body>
    <div data-turn-key="turn-id"><div data-talvt-turn-state="${state}">
      <div data-chatgpt-search-unit-key="fallback-turn-0:0:user" data-chatgpt-search-message-ids="user-id">
        <div data-content-search-unit-key="fallback-turn-0:0:user"><div data-user-message-bubble="true"><div class="whitespace-pre-wrap">test prompt</div></div></div>
      </div>
      <div data-chatgpt-search-unit-key="fallback-turn-0:2:assistant" data-chatgpt-search-message-ids="${ids}">
        <div ${nested ? 'data-message-author-role="assistant" data-message-id="assistant-id"' : ''}><div data-markdown-text-style="assistant-message">{"value":42}</div></div>
      </div>
    </div></div>
    <form><div id="prompt-textarea" contenteditable="true" role="textbox" data-composer-markdown></div></form>
  </body></html>`);
  win.location = {origin:'https://chatgpt.com', pathname:'/c/conversation-123', href:'https://chatgpt.com/c/conversation-123'};
  win.top=win;
  win.getComputedStyle=() => ({display:'block', visibility:'visible'});
  win.HTMLElement.prototype.getClientRects=() => [{}];
  Object.defineProperty(doc.querySelector('#prompt-textarea'), 'isContentEditable', {value:true});
  const scope=vm.createContext({document:doc, window:win, URL});
  const invoke=vm.runInContext('(' + chatgptDOM.toString() + ')', scope);
  return args => JSON.parse(JSON.stringify(invoke('read',args)));
}

test('current official search units retain unique message IDs, exact text and explicit completion', () => {
  const read=currentDOM()({baseline:[]});
  assert.equal(read.ok,true);
  assert.deepEqual(read.messages.map(m => [m.key,m.role,m.text,m.complete]), [
    ['user:user-id','user','test prompt',false], ['assistant:assistant-id','assistant','{"value":42}',true]
  ]);
  assert.equal(read.idle,true);
});

test('new and legacy nested markers do not count the same official message twice', () => {
  const read=currentDOM({nested:true})({baseline:['user:user-id']});
  assert.equal(read.messages.length,2);
  assert.equal(read.messages[0].text,null);
  assert.equal(read.messages[1].text,'{"value":42}');
});

test('ambiguous official IDs and incomplete turns cannot authorize a result', () => {
  assert.equal(currentDOM({ids:'one two'})({baseline:[]}).ok,false);
  const read=currentDOM({state:'streaming'})({baseline:[]});
  assert.equal(read.messages[1].complete,false);
  assert.equal(read.messages[1].streaming,true);
  assert.equal(read.idle,false);
});

function fixture() {
  const state = {clicks:0, messages:[], editor:null};
  class Textarea {
    constructor() {this.current=''; this.tagName='TEXTAREA'; this.isConnected=true;}
    get value() {return this.current;}
    set value(value) {this.current=value;}
    closest(selector) {return selector === 'form' ? form : null;}
    getAttribute() {return null;}
    querySelector() {return null;}
    getClientRects() {return [{}];}
    dispatchEvent() {}
  }
  const send = {isConnected:true, disabled:false, closest:() => null, getClientRects:() => [{}],
    getAttribute:name => name === 'data-testid' ? 'send-button' : null,
    click:() => {state.clicks++; if (state.throwClick) throw new Error('uncertain click');}};
  const form = {isConnected:true, querySelectorAll:() => [send], querySelector:() => null};
  state.editor = new Textarea();
  const win = {location:{origin:'https://chatgpt.com', pathname:'/', href:'https://chatgpt.com/'},
    getComputedStyle:() => ({display:'block', visibility:'visible'}), HTMLTextAreaElement:Textarea,
    InputEvent:class {}};
  win.top=win;
  const doc = {querySelectorAll:selector => selector.startsWith('#prompt-textarea') ? [state.editor] : state.messages,
    createRange:() => ({selectNodeContents() {}}), execCommand:(_command, _ui, text) => {
      state.editor.innerText=text; state.editor.textContent=text;
      state.editor.firstElementChild.textContent=text; return true;
    }};
  win.getSelection=() => ({removeAllRanges() {}, addRange() {}});
  const contentEditable = ({text='', marked=true, paragraphs=1} = {}) => {
    const br = {tagName:'BR', classList:{contains:name => name === 'ProseMirror-trailingBreak'}};
    const paragraph = {tagName:'P', textContent:text, childNodes:[br], firstElementChild:br,
      getAttribute:name => name === 'data-empty-paragraph' && marked ? 'true' : null};
    state.editor = {isConnected:true, isContentEditable:true, tagName:'DIV',
      innerText:text || '\n', textContent:text, childNodes:Array(paragraphs).fill(paragraph), firstElementChild:paragraph,
      closest:selector => selector === 'form' ? form : null, getAttribute:() => null,
      querySelector:() => null, getClientRects:() => [{}], focus() {}};
  };
  const scope = vm.createContext({document:doc, window:win, URL});
  const invoke = vm.runInContext('(' + chatgptDOM.toString() + ')', scope);
  const call = (action, args) => JSON.parse(JSON.stringify(invoke(action, args)));
  return {call, state, Textarea, contentEditable};
}

test('new-conversation root is a valid provisional route, without inventing a conversation ID', () => {
  const h = fixture(), read = h.call('read');
  assert.equal(read.ok, true);
  assert.equal(read.route, null);
  assert.equal(read.idle, true);
});

test('actual DOM fill preserves any existing whitespace draft', () => {
  const h = fixture();
  h.state.editor.current='\n ';
  assert.equal(h.call('fill', {route:null, keys:[], text:'send', nonce:'A'}).ok, false);
  assert.equal(h.state.editor.value, '\n ');
  assert.equal(h.state.clicks, 0);
});

test('official empty ProseMirror placeholder permits fill without sending', () => {
  const h = fixture(); h.contentEditable();
  assert.equal(h.call('read').draft, '');
  assert.equal(h.call('fill', {route:null, keys:[], text:'send', nonce:'A'}).ok, true);
  assert.equal(h.call('read').draft, 'send');
  assert.equal(h.state.clicks, 0);
});

test('contenteditable whitespace remains a protected draft even with a stale empty marker', () => {
  const h = fixture(); h.contentEditable({text:'\n '});
  assert.equal(h.call('read').draft, '\n ');
  assert.equal(h.call('fill', {route:null, keys:[], text:'send', nonce:'A'}).ok, false);
  assert.equal(h.state.editor.textContent, '\n ');
  assert.equal(h.state.clicks, 0);
});

test('unmarked or multiple empty paragraphs are not the observed empty placeholder', () => {
  for (const options of [{marked:false}, {paragraphs:2}]) {
    const h = fixture(); h.contentEditable(options);
    assert.equal(h.call('read').draft, '\n');
    assert.equal(h.call('fill', {route:null, keys:[], text:'send', nonce:'A'}).ok, false);
    assert.equal(h.state.clicks, 0);
  }
});

test('the real preparation token cannot be reused after a throwing send click', () => {
  const h = fixture(), args = {route:null, keys:[], text:'send', nonce:'A'};
  assert.equal(h.call('fill', args).ok, true);
  h.state.throwClick=true;
  assert.throws(() => h.call('send', args), /uncertain click/);
  assert.equal(h.call('send', args).ok, false);
  assert.equal(h.state.clicks, 1);
});

test('a React editor replacement cannot inherit the old preparation token', () => {
  const h = fixture(), args = {route:null, keys:[], text:'send', nonce:'A'};
  assert.equal(h.call('fill', args).ok, true);
  h.state.editor = new h.Textarea();
  h.state.editor.current='send';
  assert.equal(h.call('send', args).ok, false);
  assert.equal(h.state.clicks, 0);
});

test('real adapter relies on public goto handoff and binds a fresh trusted document', async () => {
  let documentId='doc-a';
  const calls=[];
  const page = {
    observe:async () => ({document:{documentId,url:'https://chatgpt.com/'}}),
    evaluate:async () => ({ok:true, route:null, messages:[]}),
    goto:async (url, options) => {calls.push({url,options}); documentId='doc-b';}
  };
  const site=createChatGPTControllerSite(page);
  assert.equal(await site.bind(), 'doc-a');
  assert.equal(await site.newConversation(7000), 'doc-b');
  assert.equal((await site.read()).documentId, 'doc-b');
  assert.deepEqual(calls,[{url:'https://chatgpt.com/',options:{timeout:7000,waitUntil:'domcontentloaded'}}]);
});
