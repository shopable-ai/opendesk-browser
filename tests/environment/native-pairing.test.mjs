import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevelopmentPairingRequest} from '../../src/native-agent/pairing.js';
import {initNativeAgentSettings} from '../../src/native-agent/settings.js';

test('development pairing contains only a fresh untrusted claim',()=>{
 const id='a'.repeat(32),a=createDevelopmentPairingRequest(id),b=createDevelopmentPairingRequest(id);
 const u=new URL(a.url);assert.equal(u.protocol,'opendesk:');assert.equal(u.hostname,'browser-pair');
 assert.deepEqual([...u.searchParams.keys()],['v','extensionId','nonce','issuedAt','channel']);
 assert.equal(u.searchParams.get('extensionId'),id);assert.equal(u.searchParams.get('channel'),'development');
 assert.match(u.searchParams.get('nonce'),/^[a-f0-9]{32}$/);assert.notEqual(a.url,b.url);
 assert.equal(a.expiresAt-Number(u.searchParams.get('issuedAt')),120000);
 for(const bad of ['', 'z'.repeat(32),id+'/',id+'?path=/'])assert.throws(()=>createDevelopmentPairingRequest(bad));
});

test('pairing rejects synthetic clicks and creates no Native or project request',async()=>{
 const nodes=new Map(['bridge-status','bridge-enable','bridge-disable','bridge-refresh','bridge-pair'].map(id=>[id,{listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}}]));
 const requests=[];let permissions=0;
 const api={runtime:{id:'a'.repeat(32),sendMessage:async msg=>{requests.push(msg.type);return {ok:true,data:{enabled:false,nativeConnected:false,extensionId:'a'.repeat(32),hostCount:0}};}},permissions:{request(){permissions++;return Promise.resolve(true);}}};
 const navigations=[];
 initNativeAgentSettings({api,document:{hidden:false,getElementById:id=>nodes.get(id)},navigate:url=>navigations.push(url)});
 await Promise.resolve();await Promise.resolve();requests.length=0;
 const pair=nodes.get('bridge-pair');let prevented=0;
 pair.listeners.click({isTrusted:false,preventDefault(){prevented++;}});
 assert.equal(prevented,1);assert.deepEqual(navigations,[]);
 pair.listeners.click({isTrusted:true,preventDefault(){throw Error('trusted navigation prevented');}});
 assert.equal(navigations.length,1);assert.match(navigations[0],/^opendesk:\/\/browser-pair\?/);assert.equal(permissions,0);assert.deepEqual(requests,[]);
 assert.match(nodes.get('bridge-status').textContent,/等待 OpenDesk 原生确认/);
});
