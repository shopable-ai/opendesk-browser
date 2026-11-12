import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGE_MATCHES,providerFor,newChatDestination,projectDestination,requestNewChat}
  from '../src/destinations.js';

const chat='https://chatgpt.com/c/abc-def';
const project='https://chatgpt.com/g/g-p-6abf8a999a548191919851197b47446f/project';
const claude='https://claude.ai/project/123e4567-e89b-12d3-a456-426614174000';

test('fixed reviewable website scopes, no blanket all-site grant',()=>{
  assert.deepEqual(PAGE_MATCHES,[
    'https://chatgpt.com/*','https://claude.ai/*',
    'https://chat.deepseek.com/*','https://gemini.google.com/*'
  ]);
  assert.equal(providerFor('https://chatgpt.com.evil.example/'),null);
  assert.equal(providerFor('http://chatgpt.com/'),null);
});

test('ordinary chat never reuses existing conversation URL',()=>{
  assert.deepEqual(newChatDestination(chat),
    {url:'https://chatgpt.com/',kind:'ordinary',provider:'chatgpt'});
  assert.deepEqual(newChatDestination('https://claude.ai/chat/whatever'),
    {url:'https://claude.ai/new',kind:'ordinary',provider:'claude'});
  assert.deepEqual(newChatDestination('https://chat.deepseek.com/a/chat/s/abc'),
    {url:'https://chat.deepseek.com/',kind:'ordinary',provider:'deepseek'});
  assert.deepEqual(newChatDestination('https://gemini.google.com/app/abc'),
    {url:'https://gemini.google.com/app',kind:'ordinary',provider:'gemini'});
});

test('project identity is explicit; /c/:id never gets guessed project context',()=>{
  assert.equal(newChatDestination(chat,{fromProjectPage:true}),null);
  assert.deepEqual(newChatDestination(chat,{projectHref:project}),
    {url:project,kind:'project',provider:'chatgpt'});
  assert.deepEqual(newChatDestination(project,{fromProjectPage:true}),
    {url:project,kind:'project',provider:'chatgpt'});
  assert.deepEqual(newChatDestination('https://claude.ai/new',{projectHref:claude}),
    {url:claude,kind:'project',provider:'claude'});
});

test('project links strip query and fragment and refuse cross-site and malformed IDs',()=>{
  assert.equal(projectDestination(project+'?share=1#x',chat).url,project);
  assert.equal(projectDestination(claude+'?x=1', 'https://claude.ai/chat/foo').url,claude);
  assert.equal(newChatDestination(chat,{projectHref:claude}),null);
  assert.equal(projectDestination('https://chatgpt.com/c/abc',chat),null);
  assert.equal(projectDestination('https://chatgpt.com/g/g-p-short/project',chat),null);
  assert.equal(projectDestination('https://chatgpt.com.evil.example/g/g-p-6abf8a999a548191919851197b47446f/project',chat),null);
  assert.equal(projectDestination('/g/g-p-6abf8a999a548191919851197b47446f/project',chat).url,project);
});

test('opening asks a separate window or tab, never changes source location',()=>{
  const calls=[],source=new URL(chat);
  const win={location:source,open:(...args)=>{calls.push(args);return null;}};
  const destination=newChatDestination(chat);
  assert.equal(requestNewChat(win,destination),true);
  assert.deepEqual(calls[0].slice(0,2),['https://chatgpt.com/','_blank']);
  assert.match(calls[0][2],/noopener/);
  assert.match(calls[0][2],/popup=yes/);
  assert.equal(requestNewChat(win,destination,{mode:'tab'}),true);
  assert.equal(calls[1][2],'noopener,noreferrer');
  assert.equal(win.location.href,chat);
});

test('reject fabricated destinations and unsupported modes without opening',()=>{
  const calls=[],win={open:(...args)=>calls.push(args)};
  assert.equal(requestNewChat(win,{url:'https://evil.example/',kind:'project',provider:'chatgpt'}),false);
  assert.equal(requestNewChat(win,{url:'https://chatgpt.com/c/old',kind:'ordinary',provider:'chatgpt'}),false);
  assert.equal(requestNewChat(win,newChatDestination(chat),{mode:'same-tab'}),false);
  assert.equal(calls.length,0);
});
