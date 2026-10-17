import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {answerRootOf,discoverAnswers,inspectAnswer,isStreaming} from '../src/chatgpt-adapter.js';

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
