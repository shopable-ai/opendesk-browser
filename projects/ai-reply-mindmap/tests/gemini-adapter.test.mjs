import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {discoverAnswers,inspectAnswer,isStreaming,setConcealed} from '../src/gemini-adapter.js';
import {extractAnswerTree} from '../src/extract.js';
import {createCustomSelectorAdapter} from '../src/custom-selector-adapter.js';
import {createAnswerRegistry} from '../src/answer-registry.js';
import * as builtin from '../src/gemini-adapter.js';

const reply=(id,label)=>'<model-response id="'+id+'"><message-content><div class="markdown">'+
  '<h2>'+label+'</h2><ul><li>Soil</li><li>Water</li></ul></div></message-content>'+
  '<message-actions><button aria-label="Copy"></button></message-actions></model-response>';

function fixture(url='https://gemini.google.com/app/test-chat'){
  return new JSDOM('<chat-window><user-query><div class="markdown">Private draft</div>'+
    '<message-actions><button aria-label="Copy"></button></message-actions></user-query>'+
    reply('a','Garden Plan')+reply('b','Travel Plan')+'</chat-window>',{url}).window.document;
}

test('Gemini extracts only the uniquely paired answer body and action group',()=>{
  const doc=fixture(),[a,b]=discoverAnswers(doc);
  assert.equal(a.id,'a');assert.equal(b.id,'b');
  const parts=inspectAnswer(a),result=JSON.stringify(extractAnswerTree(parts.content));
  assert.equal(parts.bar.closest('model-response'),a);
  for(const text of ['Garden Plan','Soil','Water'])assert.ok(result.includes(text));
  for(const text of ['Private draft','Travel Plan'])assert.ok(!result.includes(text));
  parts.bar.remove();
  assert.equal(inspectAnswer(a).ok,false,'cannot use the other answer or user actions');
  assert.equal(inspectAnswer(b).ok,true);
});

test('Gemini refuses duplicate/hidden content and does not mistake a viewer hide for page replacement',()=>{
  const doc=fixture(),[a]=discoverAnswers(doc),{content}=inspectAnswer(a);
  content.setAttribute('aria-hidden','true');
  assert.equal(inspectAnswer(a).ok,false);
  setConcealed(content,true);
  assert.equal(inspectAnswer(a).content,content);
  content.parentElement.append(content.cloneNode(true));
  content.parentElement.lastChild.removeAttribute('aria-hidden');
  assert.equal(inspectAnswer(a).ok,false);
});

test('latest Gemini reply remains busy until its native stop control is gone',()=>{
  const doc=fixture(),[a,b]=discoverAnswers(doc);
  doc.querySelector('chat-window').insertAdjacentHTML('beforeend','<button aria-label="Stop response"></button>');
  assert.equal(isStreaming(a),false);
  assert.equal(isStreaming(b),true);
  doc.querySelector('button[aria-label="Stop response"]').remove();
  assert.equal(isStreaming(b),false);
  inspectAnswer(b).bar.querySelector('button').disabled=true;
  assert.equal(isStreaming(b),true);
  assert.deepEqual(discoverAnswers(fixture('https://gemini.google.com/library')),[]);
});

test('Gemini targets the native copy row inside the block footer with built-in or saved selectors',()=>{
  const doc=fixture(),[a,b]=discoverAnswers(doc);
  const footer=a.querySelector('message-actions');
  footer.innerHTML='<div class="footer-banner"></div><div class="buttons-container-v2">'+
    '<button aria-label="Good response"></button><copy-button><button aria-label="Copier"></button></copy-button><div class="spacer"></div></div>';
  const custom=createCustomSelectorAdapter('https://gemini.google.com',
    {root:'model-response',body:'message-content .markdown',actions:'message-actions'},builtin);
  for(const adapter of [builtin,custom]){
    const {bar,before}=adapter.inspectAnswer(a);
    assert.equal(bar,footer.querySelector('.buttons-container-v2'));
    assert.notEqual(bar,adapter.inspectAnswer(b).bar);
    const owner={active:()=>true,on:()=>()=>{},observe(){},setInterval(){}};
    const registry=createAnswerRegistry({document:doc,window:doc.defaultView,owner,css:'',adapter});
    registry.start();
    assert.equal(before.previousElementSibling.querySelector('[data-opendesk-chatgpt-mindmap="button"]')?.parentElement,bar.querySelector('[data-ai-answer-tools]'));
    registry.destroy();
  }
});
