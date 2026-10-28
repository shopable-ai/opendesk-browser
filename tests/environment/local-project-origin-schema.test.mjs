import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import {validControllerProjectOrigins} from '../../src/platform/local-project-site-scope.js';

const schema=JSON.parse(await readFile(new URL('../../schemas/opendesk-program-project.v1.schema.json',import.meta.url),'utf8'));
const ajv=new Ajv2020({strict:false});
const validate=ajv.compile(schema.$defs.controller.allOf[1].properties.siteOrigins);

test('public Controller origin schema agrees with local scope shape, exact-list bounds and exclusive wildcard',()=>{
  const eight=Array.from({length:8},(_,i)=>`https://s${i}.example`);
  for(const origins of [['https://example.com'],['<all_urls>'],eight,
    ['https://example.com','http://localhost:43111','https://[::1]:8443']]){
    assert.equal(validControllerProjectOrigins(origins),true);
    assert.equal(validate(origins),true,JSON.stringify(ajv.errors));
  }
  for(const origins of [[],[...eight,'https://ninth.example'],['https://example.com','https://example.com'],
    ['<all_urls>','https://example.com'],['<all_urls>','<all_urls>'],['*'],[''],
    ['https://*.example'],['http://*'],['https://user:pass@example.com'],['https://example.com/'],['https://example.com/path'],
    ['https://example.com?q=x'],['https://example.com#x'],['null'],['about:blank']]){
    assert.equal(validControllerProjectOrigins(origins),false);
    assert.equal(validate(origins),false,JSON.stringify(origins));
  }
});

test('whole public project schema accepts a multi-origin Controller without weakening Page/Controller discrimination',async()=>{
  const validateProject=ajv.compile(schema);
  const project=JSON.parse(await readFile('examples/programs/controller-title/package.json','utf8'));
  project.opendesk.siteOrigins=['https://first.example','http://localhost:43111','https://third.example'];
  assert.equal(validateProject(project),true,JSON.stringify(validateProject.errors));
  project.opendesk.siteOrigins.push('<all_urls>');
  assert.equal(validateProject(project),false);
});
