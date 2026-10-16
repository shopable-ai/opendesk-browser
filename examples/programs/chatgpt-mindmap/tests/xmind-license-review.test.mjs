import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyLicenseReview} from '../scripts/verify-license-review.mjs';

const names=['jszip.min.js','polyfill-45b9836beb.min.js',
  'xmind-sdk.bundle.js','snowbrush-2c2b5d62b5.js'];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const identity=bytes=>({bytes:bytes.length,sha256:digest(bytes)});

async function fixture(t){
  const directory=await mkdtemp(join(tmpdir(),'xmind-license-review-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const testsRoot=join(directory,'tests');
  await mkdir(join(testsRoot,'license-evidence/r394'),{recursive:true});
  const resources=new Map(names.map((name,index)=>['/'+name,
    Buffer.from('/*! upstream '+index+' */\ncomplete artifact '+index+'\n\0\xff','latin1')]));
  const assets=names.map(name=>({name,...identity(resources.get('/'+name))}));
  const provenance={assets};
  const provenanceBytes=Buffer.from(JSON.stringify(provenance)+'\n');
  const raw=Buffer.from('Synthetic license reference\r\n\xff','latin1');
  const reference={component:'license-reference',sourceUrl:'https://example.invalid/LICENSE',
    referenceLicense:'MIT',exactEmbeddedArtifactMapping:'UNPROVEN',noticeClosure:'UNPROVEN',
    redistributionApproved:false,captureStatus:'CAPTURED',
    file:'license-evidence/r394/reference.txt',...identity(raw)};
  await writeFile(join(testsRoot,reference.file),raw);
  const review={format:'opendesk.mindmap.license-reference-review.v1',reviewedOn:'2026-10-17',
    status:'BLOCKED',installable:false,redistributionApproved:false,
    scope:'UPSTREAM_REFERENCE_TEXTS_ONLY_NOT_EXACT_BUNDLE_APPROVAL',
    provenanceSha256:digest(provenanceBytes),assets:assets.map(asset=>({...asset,approval:'BLOCKED'})),
    references:[reference]};
  return {review,provenance,provenanceBytes,resources,testsRoot,directory};
}
async function addReference(input,raw,component='upstream-artifact'){
  const reference={...input.review.references[0],component,
    file:'license-evidence/r394/'+component+'.bin',...identity(raw)};
  await writeFile(join(input.testsRoot,reference.file),raw);
  input.review.references.push(reference);
  return reference;
}
function mapBytes(input,reference,raw=input.resources.get('/'+names[0])){
  input.review.byteMappings=[{asset:names[0],reference:reference.component,...identity(raw)}];
}
async function rejects(input,code){
  await assert.rejects(verifyLicenseReview(input),error=>{
    assert.match(error.code,/^E_XMIND_LICENSE_/);
    assert.match(error.message,new RegExp(error.code));
    if(code)assert.equal(error.code,'E_XMIND_LICENSE_'+code);
    return true;
  });
}

test('r394 captured reference bytes verify while legal approval stays blocked',async t=>{
  const input=await fixture(t),before=structuredClone(input.review);
  const result=await verifyLicenseReview(input);
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.legalApproval,false);
  assert.equal(result.redistributionApproved,false);
  assert.equal(result.installable,false);
  assert.equal(result.provenanceSha256,input.review.provenanceSha256);
  assert.deepEqual(result.references,[{component:before.references[0].component,
    file:before.references[0].file,bytes:before.references[0].bytes,
    sha256:before.references[0].sha256,verified:true}]);
  assert.deepEqual(result.byteMappings,[]);
  assert.deepEqual(input.review,before);
});
test('missing or malformed input and review format use license error codes',async t=>{
  for(const input of [undefined,null,[],{},true,{review:null},{review:{format:'v2'}}])
    await rejects(input,'SCHEMA');
  const input=await fixture(t);
  delete input.review.format;
  await rejects(input,'SCHEMA');
});
test('provenance hash is mandatory and binds original JSON bytes',async t=>{
  for(const mode of ['missing','tampered','reformatted'])await t.test(mode,async t=>{
    const input=await fixture(t);
    if(mode==='missing')delete input.review.provenanceSha256;
    if(mode==='tampered')input.provenanceBytes=Buffer.concat([input.provenanceBytes,Buffer.from(' ')]);
    if(mode==='reformatted')input.provenanceBytes=Buffer.from(JSON.stringify(input.provenance,null,2));
    await rejects(input,'PROVENANCE_HASH');
  });
});
test('invalid provenance JSON fails with a license error even with a matching digest',async t=>{
  const input=await fixture(t);
  input.provenanceBytes=Buffer.from('{');
  input.review.provenanceSha256=digest(input.provenanceBytes);
  await rejects(input,'PROVENANCE');
});
test('both manifests require exactly the four distinct fixed asset names',async t=>{
  for(const target of ['review','provenance'])for(const mode of ['missing','extra','duplicate','renamed'])
    await t.test(target+' '+mode,async t=>{
      const input=await fixture(t),rows=input[target].assets;
      if(mode==='missing')rows.pop();
      if(mode==='extra')rows.push({...rows[0],name:'extra.js'});
      if(mode==='duplicate')rows[1]={...rows[0]};
      if(mode==='renamed')rows[0].name='/'+rows[0].name;
      if(target==='provenance'){
        input.provenanceBytes=Buffer.from(JSON.stringify(input.provenance));
        input.review.provenanceSha256=digest(input.provenanceBytes);
      }
      await rejects(input,target==='review'?'ASSETS':'PROVENANCE_ASSETS');
    });
});
test('asset digest and size must match provenance and supplied raw Buffers',async t=>{
  for(const mode of ['review-size','review-hash','raw-size','raw-hash','missing','string','wrong-key'])
    await t.test(mode,async t=>{
      const input=await fixture(t),asset=input.review.assets[0],key='/'+asset.name;
      if(mode==='review-size')asset.bytes++;
      if(mode==='review-hash')asset.sha256='0'.repeat(64);
      if(mode==='raw-size')input.resources.set(key,Buffer.from('truncated'));
      if(mode==='raw-hash')input.resources.get(key)[0]^=1;
      if(mode==='missing')input.resources.delete(key);
      if(mode==='string')input.resources.set(key,input.resources.get(key).toString());
      if(mode==='wrong-key'){
        input.resources.set(asset.name,input.resources.get(key));input.resources.delete(key);
      }
      await rejects(input);
    });
});
test('missing, changed or uncaptured reference files fail closed',async t=>{
  for(const mode of ['missing-file','tampered-file','size','hash','missing-hash','missing-path','not-captured','directory'])
    await t.test(mode,async t=>{
      const input=await fixture(t),ref=input.review.references[0],file=join(input.testsRoot,ref.file);
      if(mode==='missing-file')await rm(file);
      if(mode==='tampered-file')await writeFile(file,Buffer.alloc(ref.bytes,65));
      if(mode==='size')ref.bytes++;
      if(mode==='hash')ref.sha256='0'.repeat(64);
      if(mode==='missing-hash')delete ref.sha256;
      if(mode==='missing-path')delete ref.file;
      if(mode==='not-captured')ref.captureStatus='PENDING';
      if(mode==='directory'){await rm(file);await mkdir(file);}
      await rejects(input);
    });
});
test('absolute paths, traversal and paths outside license-evidence are rejected',async t=>{
  for(const file of ['/tmp/license.txt','C:\\license.txt','C:/license.txt','../license.txt',
    'license-evidence/../../license.txt','license-evidence/r394/../reference.txt',
    'license-evidence/./reference.txt','license-evidence//reference.txt','other/reference.txt',
    'license-evidence\\reference.txt','license-evidence/','license-evidence/r394/\0.txt'])
    await t.test(JSON.stringify(file),async t=>{
      const input=await fixture(t);input.review.references[0].file=file;
      await rejects(input,'REFERENCE_PATH');
    });
});
test('file and directory symlinks cannot escape the evidence root',async t=>{
  for(const mode of ['file-outside-tests','directory-outside-tests','file-inside-tests','evidence-root'])
    await t.test(mode,async t=>{
      const input=await fixture(t),ref=input.review.references[0];
      const outside=mode==='file-inside-tests'?input.testsRoot:input.directory;
      const target=join(outside,'outside');
      await mkdir(target);
      await writeFile(join(target,'reference.txt'),Buffer.from('Synthetic license reference\r\n\xff','latin1'));
      if(mode==='evidence-root'){
        await rm(join(input.testsRoot,'license-evidence'),{recursive:true});
        await symlink(target,join(input.testsRoot,'license-evidence'),'dir');
        ref.file='license-evidence/reference.txt';
      }else if(mode==='directory-outside-tests'){
        await symlink(target,join(input.testsRoot,'license-evidence/link'),'dir');
        ref.file='license-evidence/link/reference.txt';
      }else{
        await rm(join(input.testsRoot,ref.file));
        await symlink(join(target,'reference.txt'),join(input.testsRoot,ref.file));
      }
      await rejects(input,'REFERENCE_PATH');
    });
});
test('duplicate reference components or capture paths are rejected',async t=>{
  for(const mode of ['component','file'])await t.test(mode,async t=>{
    const input=await fixture(t),ref=input.review.references[0];
    input.review.references.push({...ref,...(mode==='file'?{component:'other'}:{})});
    await rejects(input,'REFERENCE_DUPLICATE');
  });
});
test('missing references, mapping components or mapping assets are rejected',async t=>{
  for(const mode of ['no-references','unknown-component','unknown-asset'])await t.test(mode,async t=>{
    const input=await fixture(t);
    if(mode==='no-references')input.review.references=[];
    else{
      mapBytes(input,input.review.references[0]);
      if(mode==='unknown-component')input.review.byteMappings[0].reference='not-captured';
      if(mode==='unknown-asset')input.review.byteMappings[0].asset='unknown.js';
    }
    await rejects(input);
  });
});
test('fake approval at review, asset, reference or mapping level is rejected',async t=>{
  const cases=[['review','status','APPROVED'],['review','installable',true],
    ['review','redistributionApproved',true],['review','legalApproval',true],
    ['asset','approval','APPROVED'],['asset','approval','PASS'],
    ['reference','redistributionApproved',true],['reference','approval','APPROVED'],
    ['mapping','legalApproval',true]];
  for(const [target,key,value] of cases)await t.test(target+'.'+key+'='+value,async t=>{
    const input=await fixture(t);
    const ref=await addReference(input,input.resources.get('/'+names[0]));mapBytes(input,ref);
    const row={review:input.review,asset:input.review.assets[0],
      reference:input.review.references[0],mapping:input.review.byteMappings[0]}[target];
    row[key]=value;
    await rejects(input,'APPROVAL');
  });
});
test('r395 exact raw artifact mapping verifies without approving redistribution',async t=>{
  const input=await fixture(t),raw=input.resources.get('/'+names[0]);
  const ref=await addReference(input,raw);mapBytes(input,ref);
  const result=await verifyLicenseReview(input);
  assert.deepEqual(result.byteMappings,[{...input.review.byteMappings[0],verified:true}]);
  assert.equal(result.references.length,2);
  assert.ok(result.references.every(row=>row.verified));
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.legalApproval,false);
  assert.equal(result.installable,false);
  assert.equal(result.redistributionApproved,false);
});
test('each of four exact mappings uses its own full captured artifact',async t=>{
  const input=await fixture(t);
  input.review.byteMappings=[];
  for(const [index,asset] of input.review.assets.entries()){
    const raw=input.resources.get('/'+asset.name),ref=await addReference(input,raw,'artifact-'+index);
    input.review.byteMappings.push({asset:asset.name,reference:ref.component,...identity(raw)});
  }
  const result=await verifyLicenseReview(input);
  assert.equal(result.byteMappings.length,4);
  assert.ok(result.byteMappings.every(row=>row.verified));
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.legalApproval,false);
});
test('header, version, partial and different full artifacts are not exact byte mappings',async t=>{
  for(const mode of ['header','version','prefix','same-size-different-bytes','text-normalization'])
    await t.test(mode,async t=>{
      const input=await fixture(t),raw=input.resources.get('/'+names[0]);
      let upstream;
      if(mode==='header')upstream=Buffer.from('/*! upstream 0 */');
      if(mode==='version')upstream=Buffer.from('version 3.10.1');
      if(mode==='prefix')upstream=raw.subarray(0,raw.length-1);
      if(mode==='same-size-different-bytes'){upstream=Buffer.from(raw);upstream[upstream.length-1]^=1;}
      if(mode==='text-normalization')upstream=Buffer.from(raw.toString('utf8'));
      const ref=await addReference(input,upstream);mapBytes(input,ref,upstream);
      await rejects(input,'MAPPING_BYTES');
    });
});
test('mapping uses its named reference capture, never an alternate file or another reference',async t=>{
  const input=await fixture(t),raw=input.resources.get('/'+names[0]);
  const exact=await addReference(input,raw);
  mapBytes(input,input.review.references[0]);
  input.review.byteMappings[0].file=exact.file;
  await rejects(input,'MAPPING_BYTES');
});
test('mapping size/hash are independently checked and duplicate asset mappings rejected',async t=>{
  for(const mode of ['size','hash','missing-size','missing-hash','duplicate','non-array'])
    await t.test(mode,async t=>{
      const input=await fixture(t),ref=await addReference(input,input.resources.get('/'+names[0]));
      mapBytes(input,ref);
      if(mode==='size')input.review.byteMappings[0].bytes--;
      if(mode==='hash')input.review.byteMappings[0].sha256='0'.repeat(64);
      if(mode==='missing-size')delete input.review.byteMappings[0].bytes;
      if(mode==='missing-hash')delete input.review.byteMappings[0].sha256;
      if(mode==='duplicate')input.review.byteMappings.push({...input.review.byteMappings[0]});
      if(mode==='non-array')input.review.byteMappings={};
      await rejects(input);
    });
});
