import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile, readFile, lstat, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {HistoryStore} from '../../ai-account-usage/history-store.mjs';

const storeUrl = new URL('../../ai-account-usage/history-store.mjs', import.meta.url).href;
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'history-concurrency-'));
  t.after(() => rm(directory, {recursive:true, force:true}));
  return {directory, first:new HistoryStore({directory}), second:new HistoryStore({directory})};
}
const busy = error => error.code === 'E_HISTORY_BUSY';
const retry = async run => {
  for (let i=0; i<200; i++) {
    try { return await run(); } catch (error) {
      if (!busy(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }
  throw Error('lock wait exceeded');
};
test('two instances retain both registrations, or explicitly reject contention', async t => {
  const {first,second} = await setup(t);
  const results = await Promise.allSettled([
    first.register({alias:'alpha',displayName:'Alpha'}),
    second.register({alias:'bravo',displayName:'Bravo'})
  ]);
  for (const [i,result] of results.entries()) if (result.status === 'rejected') {
    assert.equal(result.reason.code,'E_HISTORY_BUSY');
    await [first,second][i].register({alias:['alpha','bravo'][i],displayName:['Alpha','Bravo'][i]});
  }
  assert.deepEqual((await first.accounts()).map(row=>row.alias).sort(),['alpha','bravo']);
});
test('existing uncertain or symlink lock is never deleted, and reads remain available', async t => {
  const {directory,first,second} = await setup(t);
  await first.register({alias:'alpha',displayName:'Alpha'});
  const lock=join(directory,'.history-v1.lock');
  await writeFile(lock,'uncertain owner',{mode:0o600});
  assert.equal((await lstat(lock)).mode & 0o777,0o600);
  await assert.rejects(second.register({alias:'bravo',displayName:'Bravo'}),busy);
  await assert.rejects(second.record('alpha',{}),busy);
  assert.equal(await readFile(lock,'utf8'),'uncertain owner');
  assert.equal((await first.accounts()).length,1);
  await rm(lock);
  const target=join(directory,'keep');await writeFile(target,'keep',{mode:0o600});await symlink(target,lock);
  await assert.rejects(first.register({alias:'bravo',displayName:'Bravo'}),busy);
  assert.ok((await lstat(lock)).isSymbolicLink());assert.equal(await readFile(target,'utf8'),'keep');
});
test('transaction failure releases lock and permits another instance to write',async t => {
  const {directory,first,second}=await setup(t);
  await assert.rejects(first.register({alias:'!'}));
  await second.register({alias:'alpha',displayName:'Alpha'});
  await assert.rejects(first.record('alpha',{}));
  await second.register({alias:'bravo',displayName:'Bravo'});
  await assert.rejects(lstat(join(directory,'.history-v1.lock')), {code:'ENOENT'});
  assert.equal((await first.accounts()).length,2);
});
const childCode = `
import {HistoryStore} from ${JSON.stringify(storeUrl)};
const store = new HistoryStore({directory:process.argv[1]});
const alias=process.argv[2];
const retry=${retry.toString()};
const busy=${busy.toString()};
process.send('ready');
process.once('message', async () => {
 try {
  await retry(()=>store.register({alias,displayName:alias}));
  for(let i=0;i<8;i++) {
   const checkedAt=new Date(Date.UTC(2026,9,30,0,0,i)).toISOString();
   await retry(()=>store.record(alias,{mode:'CODEX_OAUTH',status:'OK',reason:'CODEX_OAUTH_CONFIRMED',checkedAt,
    sessionUserVerified:true,workspaceVerified:true,workspaceEvidence:'OAUTH_USAGE_USER_AND_ACCOUNT_IDS',
    identityEvidence:'OAUTH_TOKEN_CLAIMS_AND_USAGE_RESPONSE_USER_ACCOUNT_IDS',
    identity:{userId:alias,accountId:'account-'+alias,email:alias+'@example.com',emailSource:'OAUTH_CACHE',
     displayName:alias,displayNameSource:'OAUTH_CACHE',observedAt:checkedAt},
    windows:[{key:'primary',durationSeconds:18000,usedPercent:i,remainingPercent:100-i,resetsAt:'2026-10-30T05:00:00.000Z'}]}));
  }
  process.disconnect();
 } catch(e) {console.error(e.code || 'CHILD_FAILED'); process.exit(1);}
});`;
test('real child processes preserve both identity bindings and all accepted history writes', {timeout:10000}, async t => {
  const {directory,first}=await setup(t);
  const children=['alpha','bravo'].map(alias=>spawn(process.execPath,['--input-type=module','-e',childCode,directory,alias],{stdio:['ignore','ignore','pipe','ipc']}));
  t.after(()=>children.forEach(child=>{if(child.exitCode===null) child.kill();}));
  const completed=children.map(child=>new Promise((resolve,reject)=>{
    let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});
    child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`child exit ${code}: ${stderr}`)));
  }));
  await Promise.all(children.map(child=>new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);})));
  children.forEach(child=>child.send('start'));
  await Promise.all(completed);
  const state=await first.snapshot();
  assert.equal(state.observations.length,16);
  for(const alias of ['alpha','bravo']) {
    assert.equal(state.accounts[alias].identity.userId,alias);
    assert.equal(state.observations.filter(row=>row.accountAlias===alias).length,8);
    assert.equal(state.accounts[alias].lastSuccessAt,'2026-10-30T00:00:07.000Z');
  }
});
