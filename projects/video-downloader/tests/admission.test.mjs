import test from 'node:test';
import assert from 'node:assert/strict';
import {createSidebarToolPackage} from '../../../scripts/build-sidebar-tool.mjs';
import {admitsOfficialVideoDownloader} from '../trusted/admission.js';
import {MEDIA_ID as ID} from '../trusted/policy.js';

const tool=await createSidebarToolPackage('projects/video-downloader');
const epoch='downloader-install-epoch';
const good={tool,installed:[tool],enableRecords:{},epochs:{[ID]:epoch},expectedEpoch:epoch};
const older={...tool,version:'0.0.1'};
const local={...tool,js:tool.js+'/* reviewed local edit */'};

for(const [name,changes] of [
  ['missing catalog and provenance',{}],
  ['older installed version',{tool:older,installed:[older]}],
  ['reviewed local package',{tool:local,installed:[local]}],
  ['outdated catalog and provenance',{release:{version:'0.0.1',sha256:'0'.repeat(64)},
    provenance:{[ID]:{marketId:'local',version:'0.0.1',sha256:'a'.repeat(64)}}}],
  ['initial null epoch',{epochs:{},expectedEpoch:null}]
])test('video downloader admits '+name,async()=>{
  assert.equal(await admitsOfficialVideoDownloader({...good,...changes}),true);
});

for(const [name,changes] of [
  ['uninstalled',{installed:[]}],
  ['duplicate installation',{installed:[tool,tool]}],
  ['replaced installed package',{installed:[local]}],
  ['different requested package',{tool:local}],
  ['different requested version',{tool:older}],
  ['disabled',{enableRecords:{[ID]:false}}],
  ['malformed enable record',{enableRecords:[]}],
  ['revoked epoch',{epochs:{[ID]:'revoked'}}],
  ['missing expected epoch',{epochs:{},expectedEpoch:undefined}],
  ['empty epoch',{epochs:{[ID]:''},expectedEpoch:''}],
  ['undeclared capability',{tool:{...tool,capabilities:[]},installed:[{...tool,capabilities:[]}]}],
  ['invalid package schema',{tool:{...tool,format:'invalid'},installed:[{...tool,format:'invalid'}]}]
])test('video downloader rejects '+name,async()=>{
  assert.equal(await admitsOfficialVideoDownloader({...good,...changes}),false);
});
