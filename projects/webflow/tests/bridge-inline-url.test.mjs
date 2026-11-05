import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createChatGPTBridgeSite} from '../../../src/native-agent/chatgpt-bridge-site.js';
import {createChatGPTTaskDiscovery} from '../../../src/native-agent/chatgpt-task-discovery.js';

// Observed native ChatGPT markdown decoration after pasting a plain URL.
const icon = '<span data-inline-url-icon="" aria-hidden="true" contenteditable="false"><span contenteditable="false"><svg><path d="M0 0"/></svg></span><span></span></span>';
const prompt = 'Search https://www.baidu.com/ with the approved task.';
function fixture(decoration = icon, draft = prompt) {
  const {document} = parseHTML(`<html><body><form><div id="prompt-textarea" contenteditable="true" role="textbox" data-composer-markdown><p>${draft}${decoration}</p></div><button data-testid="send-button">Send</button></form></body></html>`);
  const editor = document.querySelector('#prompt-textarea');
  for (const node of document.querySelectorAll('#prompt-textarea,button')) node.getClientRects = () => [{}];
  const win = {location:new URL('https://chatgpt.com/c/inline-url-12345678'),
    getComputedStyle:() => ({display:'block',visibility:'visible'})};
  win.top = win;
  return {document,editor,win,site:createChatGPTBridgeSite({doc:document,win})};
}

test('native URL decoration preserves exact draft and permits witnessing the original submission', () => {
  const {site} = fixture(), snapshot = site.inspect();
  assert.equal(snapshot.ok,true);
  assert.equal(snapshot.draft,prompt);
  assert.equal(snapshot.rich,false);
  assert.equal(createChatGPTTaskDiscovery().witnessSubmission(snapshot),true);
});

test('URL decoration cannot hide meaningful noneditable content, media or attachments', () => {
  for (const decoration of [
    '<span contenteditable="false">file</span>',
    icon.replace('aria-hidden="true"','aria-hidden="false"'),
    icon.replace('<svg>','meaningful<svg>'),
    icon.replace('<svg>','<img src="x"><svg>'),
    icon.replace('<svg>','<iframe></iframe><svg>'),
    icon.replace('<svg>','<input><svg>'),
    icon.replace('<svg>','<span data-file-id="file"></span><svg>'),
    `<span contenteditable="false">${icon}</span>`,
    icon + '<span contenteditable="false"></span>'
  ]) {
    const snapshot = fixture(decoration).site.inspect();
    assert.equal(snapshot.rich,true,decoration);
    assert.equal(createChatGPTTaskDiscovery().witnessSubmission(snapshot),false,decoration);
  }
  for (const attachment of ['<div data-attachment-id="file"></div>','<input type="file">']) {
    const {document,site} = fixture();
    document.querySelector('form').insertAdjacentHTML('beforeend',attachment);
    const file = document.querySelector('input');
    if (file) file.files = [{}];
    assert.equal(site.inspect().rich,true);
    assert.equal(createChatGPTTaskDiscovery().witnessSubmission(site.inspect()),false);
  }
});

test('result insertion tolerates URL decoration but rechecks changed content before its sole send', () => {
  for (const change of ['none','icon-text','attachment']) {
    const {document,editor,win,site} = fixture('','');
    let writes = 0, clicks = 0;
    editor.focus = () => {document.activeElement = editor;};
    win.getSelection = () => ({rangeCount:1,anchorNode:editor,focusNode:editor});
    document.execCommand = (command,unused,text) => {
      assert.equal(command,'insertText');
      writes++;
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      paragraph.insertAdjacentHTML('beforeend',icon);
      editor.replaceChildren(paragraph);
      return true;
    };
    document.querySelector('[data-testid="send-button"]').click = () => {clicks++;};
    const prepared = site.prepare(prompt,site.inspect());
    assert.equal(prepared.ok,true);
    assert.equal(writes,1);
    assert.equal(site.inspect().draft,prompt);
    if (change === 'icon-text') document.querySelector('[data-inline-url-icon]').textContent = 'file';
    if (change === 'attachment') document.querySelector('form').insertAdjacentHTML('beforeend','<div data-file-id="file"></div>');
    assert.equal(site.commit(prepared.token).ok,change === 'none');
    assert.equal(clicks,change === 'none' ? 1 : 0);
    assert.equal(site.commit(prepared.token).ok,false);
  }
});
