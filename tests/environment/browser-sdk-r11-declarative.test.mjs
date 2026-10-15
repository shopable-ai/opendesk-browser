import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {BROWSER_OPERATIONS} from '../../src/framework/sdk/browser-contract.js';

test('R11 generated SDK facade matches every approved operation without an arbitrary native bridge',()=>{
  const sdk=createBrowserSdk({request:async()=>null});
  assert.equal(Object.getPrototypeOf(sdk),null);
  for(const operation of Object.keys(BROWSER_OPERATIONS)){
    const parts=operation.slice('browser.'.length).split('.');
    let found=sdk;
    for(const segment of parts)found=found?.[segment];
    assert.equal(typeof found,'function',operation);
  }
  assert(Object.isFrozen(sdk));
  assert(Object.isFrozen(sdk.bookmarks));
  assert(Object.isFrozen(sdk.cookies.observe));
  assert.equal(Object.hasOwn(sdk,'native'),false);
  assert.equal(typeof sdk.bookmarks.getTree,'function');
});

test('R11 generated facade sends exact approved operation with existing arguments',async()=>{
  const calls=[],sdk=createBrowserSdk({request:async(operation,args)=>{
    calls.push({operation,args});return {ack:true};
  }});
  await sdk.bookmarks.createOwned({url:'https://example.com/',title:'Example'});
  await sdk.tabs.getOwned({tabRef:'a'.repeat(24)});
  await sdk.cookies.getAll({url:'https://example.com/'});
  await sdk.clipboard.writeText('copy');
  assert.deepEqual(calls,[
    {operation:'browser.bookmarks.createOwned',args:{url:'https://example.com/',title:'Example'}},
    {operation:'browser.tabs.getOwned',args:{tabRef:'a'.repeat(24)}},
    {operation:'browser.cookies.getAll',args:{url:'https://example.com/'}},
    {operation:'browser.clipboard.writeText',args:{text:'copy'}}
  ]);
  assert.equal(typeof sdk.network.watch,'function');
});

test('R11 page SDK keeps only local discovery; no generated installed-tool browser calls',async()=>{
  const page=createBrowserSdk({context:'page-sdk',request:()=>{throw Error('Must not call host')}});
  assert.equal(page.bookmarks,undefined);
  assert.equal(page.tabs,undefined);
  const status=await page.capabilities.getStatus({operation:'browser.bookmarks.create'});
  assert.equal(status.callableNow,false);
  assert.equal(status.reasonCode,'E_CONTEXT');
  await assert.rejects(page.contextMenu.register(),error=>error?.code==='E_CONTEXT');
});
