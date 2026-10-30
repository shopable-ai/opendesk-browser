import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {runControllerVm} from './helpers/controller-vm.mjs';

const record=()=>({schemaVersion:1,deliveryId:'delivery',attemptId:'attempt',accountId:'account',
  serviceOrigin:'http://127.0.0.1:7898',targetUrl:'http://127.0.0.1:7898/session/',
  state:'unknown',count:1,results:[],seen:[]});

test('controller VM bundles real ESM imports and clones Host responses into their receiving realm',async()=>{
  const storage={value:record(),etag:'original-key-cas'},network={status:200,data:record()};
  const calls=[],root={querySelector:()=>null};
  const window={OpenDeskTool:{root,request:async(...args)=>{calls.push(args);return storage;}},
    OpenDeskSDK:{browser:{network:{request:async()=>network}}}};
  const {context}=await runControllerVm(`
    import * as Session from './session-context.js';
    import * as Journal from './cookie-journal.js';
    window.done=(async()=>{
      const stored=await window.OpenDeskTool.request('storage.get',{key:Journal.COOKIE_JOURNAL_KEY});
      const response=await window.OpenDeskSDK.browser.network.request({url:'https://fixture.test/'});
      const migrated=Journal.planCookieJournalMigration(stored.value);
      window.result={
        storagePlain:Object.getPrototypeOf(stored)===Object.prototype,
        recordPlain:Object.getPrototypeOf(stored.value)===Object.prototype,
        arrayPlain:Object.getPrototypeOf(stored.value.results)===Array.prototype,
        networkPlain:Object.getPrototypeOf(response.data)===Object.prototype,
        checked:Journal.validateLegacyCookieRecord(response.data),
        migrated:Journal.validateMigratedCookieJournal(migrated),
        barrier:Journal.legacyCookieBarrier(migrated,'different-delivery'),
        sessionExport:typeof Session.normalizeCookieScope,etag:stored.etag
      };
      stored.value.state='failed';response.data.state='failed';
    })();
  `,{window,URL,TextEncoder});
  await window.done;
  const result=JSON.parse(vm.runInContext('JSON.stringify(window.result)',context));
  assert.equal(result.storagePlain,true);
  assert.equal(result.recordPlain,true);
  assert.equal(result.arrayPlain,true);
  assert.equal(result.networkPlain,true);
  assert.deepEqual(result.checked,record());
  assert.equal(result.migrated.schemaVersion,2);
  assert.deepEqual(result.migrated.legacy.record,record());
  assert.equal(result.barrier,'E_COOKIE_UNRESOLVED');
  assert.equal(result.sessionExport,'function');
  assert.equal(result.etag,'original-key-cas');
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['storage.get',{key:'aiVipCookieDeliveryR137'}]]);
  assert.deepEqual(storage.value,record());
  assert.deepEqual(network.data,record());
  assert.equal(window.OpenDeskTool.root,root);
});

test('controller VM preserves asynchronous SDK failures and undefined acknowledgements',async()=>{
  const failure=Object.assign(Error('outcome unknown'),{code:'E_OUTCOME_UNKNOWN'});
  const managed={async getStatus(){throw failure;},async requestDisable(){return undefined;}};
  const window={OpenDeskSDK:{browser:{proxy:{managed}}}};
  await runControllerVm(`
    window.done=(async()=>{
      try{await window.OpenDeskSDK.browser.proxy.managed.getStatus();}
      catch(error){window.failure=error;}
      window.ack=await window.OpenDeskSDK.browser.proxy.managed.requestDisable();
    })();
  `,{window});
  await window.done;
  assert.equal(window.failure,failure);
  assert.equal(window.failure.code,'E_OUTCOME_UNKNOWN');
  assert.equal(window.ack,undefined);
});
