// Historical release identity for a real same-ID Cookie Editor upgrade. Never
// substitute a fabricated package, a version-only match, or Chrome storage writes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const COOKIE_EDITOR_UPGRADE_FROM = Object.freeze({
  id:'cookie-editor',
  version:'2.0.15',
  sha256:'f6aa6d83533dba166497fce2d37b6ee2a358c102b3f85b63ce8c6a62d6fb64ce',
});

function versionParts(version){
  assert.match(version,/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
    'Upgrade versions must be exact numeric semver');
  return version.split('.').map(part=>BigInt(part));
}

export function verifyCookieEditorUpgradeBaseline(bytes,candidate,{
  version=COOKIE_EDITOR_UPGRADE_FROM.version,
  sha256=COOKIE_EDITOR_UPGRADE_FROM.sha256,
}={}){
  assert.equal(candidate?.id,COOKIE_EDITOR_UPGRADE_FROM.id,'Upgrade target must be Cookie Editor');
  assert.match(sha256,/^[a-f0-9]{64}$/,'Expected old package SHA-256 is required');
  const actual=createHash('sha256').update(bytes).digest('hex');
  assert.equal(actual,sha256,'Old Cookie Editor package bytes differ from the reviewed historical release');
  const old=JSON.parse(Buffer.from(bytes).toString('utf8'));
  assert.equal(old.format,'opendesk.sidebar-tool.v2');
  assert.equal(old.id,candidate.id,'Upgrade must keep the same tool ID');
  assert.equal(old.version,version,'Upgrade must begin with the reviewed prior version');
  const before=versionParts(old.version),after=versionParts(candidate.version);
  assert(before.some((n,i)=>n!==after[i]&&before.slice(0,i).every((p,j)=>p===after[j])&&n<after[i]),
    'Upgrade target must be newer than the installed historical package');
  assert(Array.isArray(old.capabilities)&&Array.isArray(candidate.capabilities));
  assert.deepEqual([...old.capabilities].sort(),[...candidate.capabilities].sort(),
    'Cookie Editor upgrade must not silently change the declared capabilities');
  return {id:old.id,version:old.version,sha256:actual};
}
