import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';

const project=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const registry=readFileSync(new URL('../src/answer-registry.js',import.meta.url),'utf8');

test('Mind Map supports three sites under the existing top-frame Page Program identity',()=>{
  assert.equal(project.opendesk.id,'opendesk.ai-reply-mindmap');
  assert.deepEqual(project.opendesk.pageRules.matches,['https://chatgpt.com/*','https://gemini.google.com/*','https://chat.deepseek.com/','https://chat.deepseek.com/a/chat/s/*']);
  assert.deepEqual(project.opendesk.pageRules.excludeMatches,[]);
  assert.equal(project.opendesk.pageRules.world,'USER_SCRIPT');
  assert.equal(project.opendesk.pageRules.allFrames,false);
  assert.match(source,/const PROGRAM_ID='opendesk\.ai-reply-mindmap'/);
  assert.doesNotMatch(source,/opendesk\.chatgpt-mindmap/);
});

test('the combined installation can mount alongside the legacy installation',async()=>{
  const mounted=new Set();
  const globals=['window','document','OpenDeskAppPage','__testMountMindmap'];
  const previous=Object.fromEntries(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const hooks=registerHooks({resolve(specifier,context,next){
    if(specifier!=='@opendesk/ui')return next(specifier,context);
    return {url:'data:text/javascript,export const createPageUI = options => globalThis.__testMountMindmap(options)',shortCircuit:true};
  }});
  try{
    const {createMindmapMain}=await import('../src/main.js');
    globalThis.window={location:new URL('https://gemini.google.com/app/test')};
    window.top=window;
    globalThis.document={defaultView:window};
    globalThis.__testMountMindmap=({id})=>{
      assert.ok(!mounted.has(id),'managed UI refuses a second live mount with the same ID');
      mounted.add(id);
      return {host:{style:{setProperty(){}}},active:()=>false};
    };
    const main=createMindmapMain({frameFactory:()=>{}});
    delete globalThis.OpenDeskAppPage;
    assert.equal((await main()).programId,project.opendesk.id);
    globalThis.OpenDeskAppPage={storage:{get:async()=>({value:null,etag:'empty'})}};
    assert.equal((await main()).programId,'app.ai-reply-mindmap');
    assert.deepEqual([...mounted],['opendesk.ai-reply-mindmap.lifecycle','app.ai-reply-mindmap.lifecycle']);
  }finally{
    hooks.deregister();
    for(const key of globals){
      if(previous[key])Object.defineProperty(globalThis,key,previous[key]);
      else delete globalThis[key];
    }
  }
});

test('legacy Viewer Theme is read-only compatibility data, not an authority alias',()=>{
  assert.match(registry,/const VIEW_THEME_KEY='opendesk\.ai-reply-mindmap\.viewer-theme\.v1'/);
  assert.match(registry,/const LEGACY_VIEW_THEME_KEY='opendesk\.chatgpt-mindmap\.viewer-theme\.v1'/);
  assert.match(registry,/program:\{id:'opendesk\.ai-reply-mindmap'/);
  assert.match(registry,/setItem\(VIEW_THEME_KEY,mode\)/);
  assert.doesNotMatch(registry,/setItem\(LEGACY_VIEW_THEME_KEY/);
});
