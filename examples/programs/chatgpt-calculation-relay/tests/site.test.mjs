// Minimal DOM contract fixtures running the actual serialized site module.
// No fixture is evidence of ChatGPT selector compatibility or Chrome success.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {chatgptDOM, createChatGPTControllerSite} from '../src/site.js';

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
  const doc = {querySelectorAll:selector => selector.startsWith('#prompt-textarea') ? [state.editor] : state.messages};
  const scope = vm.createContext({document:doc, window:win, URL});
  const invoke = vm.runInContext('(' + chatgptDOM.toString() + ')', scope);
  const call = (action, args) => JSON.parse(JSON.stringify(invoke(action, args)));
  return {call, state, Textarea};
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
