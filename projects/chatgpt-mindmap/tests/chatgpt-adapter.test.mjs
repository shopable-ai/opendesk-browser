import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {answerRootOf,discoverAnswers,inspectAnswer,isStreaming} from '../src/chatgpt-adapter.js';

// Logged-in Mac Chrome, 2026-10-18: role is on a hidden heading, body uses
// DIL components, and the turn also contains a different user action bar.
const searchReply=id=>`<div data-talvt-turn-state="complete">
  <div><div><p>user prompt</p><div class="turn-action-controls" id="user-${id}"><button>Edit</button></div></div>
    <div><div data-content-search-unit-key="turn:${id}:assistant" id="${id}">
      <h4 data-conversation-role="assistant">ChatGPT said:</h4>
      <div><div><h2 data-d-component="title">中文主题 ${id}</h2><p>正文</p></div></div>
    </div></div></div>
  <div class="turn-action-controls" id="actions-${id}"><button>Copy</button><button>More</button></div>
</div>`;

test('logged-in DIL reply binds its own body and direct assistant footer',()=>{
  const {document}=parseHTML(`<html><body>${searchReply('A')}${searchReply('B')}</body></html>`);
  const roots=discoverAnswers(document);assert.equal(roots.length,2);
  for(const root of roots){
    const parts=inspectAnswer(root);assert.equal(parts.ok,true);
    assert.equal(parts.bar.id,`actions-${root.id}`);
    assert.equal(parts.content,root.children[1]);
    assert.equal(answerRootOf(parts.content.querySelector('p')),root);
    assert.equal(isStreaming(root),false);
  }
  roots[0].closest('[data-talvt-turn-state]').setAttribute('data-talvt-turn-state','streaming');
  assert.equal(isStreaming(roots[0]),true);
  assert.equal(isStreaming(roots[1]),false);
  document.getElementById('actions-A').remove();
  assert.equal(inspectAnswer(roots[0]).ok,false); // never use the user toolbar
  assert.equal(inspectAnswer(roots[1]).ok,true);
});

test('DIL structure refuses missing role, duplicate bodies, footers or assistant roots',()=>{
  for(const mutate of [
    root=>root.querySelector('[data-conversation-role]').remove(),
    root=>root.appendChild(root.children[1].cloneNode(true)),
    root=>root.closest('[data-talvt-turn-state]').appendChild(documentBar(root)),
    root=>root.parentElement.appendChild(root.cloneNode(true)),
  ]){
    const {document}=parseHTML(`<html><body>${searchReply('A')}</body></html>`);
    const root=discoverAnswers(document)[0];mutate(root);
    assert.equal(inspectAnswer(root).ok,false);
  }
  function documentBar(root){return root.closest('[data-talvt-turn-state]').lastElementChild.cloneNode(true);}
});

// Structural attributes observed on the real anonymous ChatGPT reply on Mac,
// 2026-10-17. This regression is not a substitute for native website evidence.
const reply=(id,complete='data-message-complete')=>`<li data-message-role="assistant" id="${id}" ${complete}>
  <div data-assistant-markdown data-assistant-markdown-root><div aria-busy="false">
    <section aria-label="DIL content"><h2>准备</h2><ul><li>3 人<ul><li>English<ul><li>09:30</li></ul></li></ul></li></ul></section>
  </div></div>
  <div role="group" data-assistant-message-actions data-message-actions>
    <button data-copy-message aria-label="复制回复">Copy</button><button>Share</button>
  </div></li>`;

test('current anonymous transcript binds each assistant body to its own reply actions',()=>{
  const {document}=parseHTML(`<html><body><ol data-conversation-transcript>
    <li data-message-role="user"><p>prompt</p></li>${reply('A')}${reply('B')}
  </ol></body></html>`);
  const roots=discoverAnswers(document);assert.equal(roots.length,2);
  for(const root of roots){
    const parts=inspectAnswer(root);assert.equal(parts.ok,true);
    assert.equal(parts.turn,root);
    assert.equal(parts.content,root.querySelector('[data-assistant-markdown-root]'));
    assert.equal(parts.bar,root.querySelector('[data-assistant-message-actions]'));
    assert.equal(answerRootOf(parts.content.querySelector('li')),root);
    assert.equal(isStreaming(root),false);
  }
  roots[0].querySelector('[data-assistant-message-actions]').remove();
  assert.equal(inspectAnswer(roots[0]).ok,false);
  assert.equal(inspectAnswer(roots[1]).ok,true);
});

test('official reply groups bind Chinese and English aria-only controls without crossing replies',()=>{
  const {document}=parseHTML(`<html><body><ol>${reply('A')}${reply('B')}</ol></body></html>`);
  const roots=discoverAnswers(document);
  const labels=['复制回复','Copy response'];
  const bars=roots.map(root=>root.querySelector('[data-assistant-message-actions][data-message-actions][role="group"]'));
  roots.forEach((root,index)=>{
    const copy=bars[index].querySelector('button');
    copy.removeAttribute('data-copy-message');
    copy.setAttribute('aria-label',labels[index]);
    copy.textContent=labels[index];
    assert.ok(inspectAnswer(root).bar===bars[index]);
    copy.setAttribute('aria-label',`${labels[index]} · updated`);
    copy.textContent='';
    assert.ok(inspectAnswer(root).bar===bars[index]);
  });
  bars[0].remove();
  assert.equal(inspectAnswer(roots[0]).ok,false);
  assert.ok(inspectAnswer(roots[1]).bar===bars[1]);
});

test('an official group inside the assistant takes priority over other turn copy controls',()=>{
  const {document}=parseHTML(`<html><body><article data-testid="conversation-turn-1">
    <div data-testid="message-actions"><button data-testid="copy-turn-action-button">Copy</button></div>
    <div data-message-author-role="assistant"><div class="markdown"><p>Answer</p></div>
      <div data-assistant-message-actions data-message-actions role="group"><button aria-label="更多操作"></button></div>
    </div>
    <div data-assistant-message-actions><button data-copy-message>复制</button></div>
  </article></body></html>`);
  const root=discoverAnswers(document)[0];
  const parts=inspectAnswer(root);
  assert.equal(parts.ok,true);
  assert.ok(parts.bar===root.querySelector('[data-assistant-message-actions][data-message-actions][role="group"]'));
});

test('multiple official groups in one reply are rejected instead of choosing a copy button',()=>{
  const {document}=parseHTML(`<html><body>${reply('A')}</body></html>`);
  const root=discoverAnswers(document)[0];
  const bar=root.querySelector('[data-assistant-message-actions]');
  const other=bar.cloneNode(true);
  other.querySelector('button').removeAttribute('data-copy-message');
  other.querySelector('button').setAttribute('aria-label','Other action');
  bar.after(other);
  assert.equal(inspectAnswer(root).ok,false);
});

test('reply content and injected UI cannot supply the official action group',()=>{
  const {document}=parseHTML(`<html><body>${reply('A')}</body></html>`);
  const root=discoverAnswers(document)[0];
  const bar=root.querySelector('[data-assistant-message-actions]');
  root.querySelector('[data-assistant-markdown-root]').append(bar.cloneNode(true));
  const own=document.createElement('div');
  own.setAttribute('data-opendesk-chatgpt-mindmap','');
  own.append(bar.cloneNode(true));root.append(own);
  assert.ok(inspectAnswer(root).bar===bar);
  bar.remove();
  assert.equal(inspectAnswer(root).ok,false);
});

test('localized copy aria and text alone cannot identify a legacy action bar',()=>{
  for(const label of ['复制回复','Copy response']){
    const {document}=parseHTML(`<html><body><article data-testid="conversation-turn-1">
      <div data-message-author-role="assistant"><div class="markdown"><p>Answer</p></div></div>
      <div role="toolbar"><button aria-label="${label}">${label}</button><button>Share</button></div>
    </article></body></html>`);
    assert.equal(inspectAnswer(discoverAnswers(document)[0]).ok,false);
  }
});

test('anonymous in-progress and aria-busy replies stay disabled until complete',()=>{
  const {document}=parseHTML(`<html><body>${reply('A','')}</body></html>`);
  const root=discoverAnswers(document)[0];assert.equal(isStreaming(root),true);
  root.setAttribute('data-message-complete','');assert.equal(isStreaming(root),false);
  root.querySelector('[aria-busy]').setAttribute('aria-busy','true');
  assert.equal(isStreaming(root),true);
});

test('legacy assistant markup remains supported and ambiguous actions are rejected',()=>{
  const {document}=parseHTML('<html><body><article data-testid="conversation-turn-1"><div data-message-author-role="assistant"><div class="markdown prose"><h2>Answer</h2></div></div><div data-testid="message-actions"><button data-testid="copy-turn-action-button">Copy</button></div></article></body></html>');
  const root=discoverAnswers(document)[0];assert.equal(inspectAnswer(root).ok,true);
  const copy=document.querySelector('button');copy.after(copy.cloneNode(true));
  assert.equal(inspectAnswer(root).ok,false);
});
