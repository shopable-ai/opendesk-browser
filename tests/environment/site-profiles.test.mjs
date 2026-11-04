import test from 'node:test';
import assert from 'node:assert/strict';
import {createSiteProfileRegistry} from '../../src/page-events/site-profiles.js';

const makeProfile=(changes={})=>({id:'chatgpt',version:'1.0.0',origin:'https://chatgpt.com',
  adapter:'chatgpt',adapterVersion:'1.0.0',protocols:['webflow.task.intent.v1'],enabled:true,...changes});
const registry=(profiles)=>createSiteProfileRegistry({profiles,adapterIds:['chatgpt','generic'],
  protocolIds:['webflow.task.intent.v1']});

test('selects exact authorized profile and rejects impersonating URLs',()=>{
  const r=registry([makeProfile()]);
  assert.equal(r.select('https://chatgpt.com/c/abc').id,'chatgpt');
  for(const url of ['https://chatgpt.com.evil.test/c/a','https://evil.test/chatgpt.com',
    'http://chatgpt.com/c/a','https://chatgpt.com:444/c/a','https://chatgpt.com@evil.test/',
    'https://user@chatgpt.com/','javascript:alert(1)','not a URL'])assert.equal(r.select(url),null,url);
});

test('simple sites can share a generic adapter with separate profiles',()=>{
  const r=registry([makeProfile(),makeProfile({id:'site-a',origin:'https://a.test',adapter:'generic'}),
    makeProfile({id:'site-b',origin:'https://b.test',adapter:'generic'})]);
  assert.equal(r.select('https://a.test/path').adapter,'generic');
  assert.equal(r.select('https://b.test/').id,'site-b');
  assert.equal(r.select('https://unregistered.test/'),null);
});

test('rejects ambiguous, unknown, malformed, and privilege-bearing profiles',()=>{
  const invalid=[
    [makeProfile(),makeProfile({id:'other'})],
    [makeProfile(),makeProfile({origin:'https://other.test'})],
    [makeProfile({origin:null})],
    [makeProfile({origin:undefined})],
    [makeProfile({protocols:Array(1)})],
    [makeProfile({protocols:[undefined]})],
    [makeProfile({origin:'https://chatgpt.com/path'})],
    [makeProfile({origin:'https://*.chatgpt.com'})],
    [makeProfile({origin:'https://user@chatgpt.com'})],
    [makeProfile({adapter:'not-registered'})],
    [makeProfile({protocols:['unknown']})],
    [makeProfile({protocols:['webflow.task.intent.v1','webflow.task.intent.v1']})],
    [makeProfile({permissions:['tabs']})],
    [makeProfile({adapterVersion:'latest'})],
  ];
  for(const profiles of invalid)assert.throws(()=>registry(profiles));
});

test('disabled profiles are never selected and profiles cannot change after registration',()=>{
  const profile=makeProfile();
  const disabled=makeProfile({id:'disabled',origin:'https://disabled.test',enabled:false});
  const r=registry([profile,disabled]);
  profile.origin='https://evil.test';profile.protocols.push('unknown');
  const selected=r.select('https://chatgpt.com/');
  assert.equal(selected.origin,'https://chatgpt.com');
  assert.deepEqual(selected.protocols,['webflow.task.intent.v1']);
  assert.ok(Object.isFrozen(selected));assert.ok(Object.isFrozen(selected.protocols));
  assert.equal(r.select('https://evil.test/'),null);
  assert.equal(r.select('https://disabled.test/'),null);
});
