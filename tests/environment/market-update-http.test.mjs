import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createMarketIndexResponder,readMarketSnapshotFile,MARKET_INDEX_FILE,UPDATE_INDEX_PATH} from '../../scripts/market-index-response.mjs';
import {buildMarketSite} from '../../scripts/build-market-site.mjs';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';

const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const publicKeys={'http-test':publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64')};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixedTime=Date.parse('2026-11-20T00:00:00Z');
function payload(releases=[],now=fixedTime,sequence=1){
  return {schema:'opendesk.market.update-index.v1',sourceId:'opendesk-official',channel:'stable',sequence,
    issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60000).toISOString(),complete:true,releases};
}
function signed(value){
  // Deliberately preserve noncanonical JSON whitespace; the HTTP contract sends
  // the stored envelope and verifies original payload bytes, not reserialization.
  const raw=Buffer.from(JSON.stringify(value,null,2)+'\n');
  const envelope={schema:'opendesk.market.signed-index.v1',algorithm:'Ed25519',keyId:'http-test',payload:raw.toString('base64'),signature:''};
  envelope.signature=sign(null,Buffer.concat([Buffer.from(envelope.schema+'\nEd25519\nhttp-test\n'),raw]),privateKey).toString('base64');
  return Buffer.from(JSON.stringify(envelope,null,2)+'\n');
}
async function http(t,responder){
  let origin;
  const server=createServer(async(req,res)=>{
    try{
      const response=await responder(new Request(new URL(req.url,origin),{method:req.method,headers:req.headers}));
      if(!response){res.writeHead(404,{'Content-Type':'text/html'});res.end('<h1>Not found</h1>');return;}
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));
    }catch(error){res.writeHead(500);res.end(error.message);}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  origin='http://127.0.0.1:'+server.address().port;
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  return (path=UPDATE_INDEX_PATH,options={})=>fetch(origin+path,{redirect:'manual',...options});
}

test('real HTTP returns exact JSON bytes, stable route, ETag and explicit conditional-request CORS',async t=>{
  const bytes=signed(payload()),origin='https://consumer.example';let reads=0;
  const request=await http(t,createMarketIndexResponder({publicKeys,readSnapshot:async()=>{reads++;return bytes;},now:fixedTime,allowOrigins:[origin]}));
  const response=await request(UPDATE_INDEX_PATH,{headers:{Origin:origin}});
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^application\/json/);
  assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('access-control-allow-origin'),origin);
  assert.match(response.headers.get('access-control-expose-headers'),/ETag/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  const etag=response.headers.get('etag');
  assert.equal(etag,'"'+hash(bytes)+'"');
  const unchanged=await request(UPDATE_INDEX_PATH,{headers:{'If-None-Match':etag}});
  assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'');assert.equal(reads,2);
  const preflight=await request(UPDATE_INDEX_PATH,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'If-None-Match'}});
  assert.equal(preflight.status,204);assert.match(preflight.headers.get('access-control-allow-headers'),/If-None-Match/);
  const unapproved=await request(UPDATE_INDEX_PATH,{headers:{Origin:'https://unapproved.example'}});
  assert.equal(unapproved.headers.get('access-control-allow-origin'),null);
  const query=await request(UPDATE_INDEX_PATH+'?where[version][equals]=0.0.0&page=2&depth=99');
  assert.deepEqual(Buffer.from(await query.arrayBuffer()),bytes,'CMS queries cannot alter snapshot semantics');
});

test('unknown channels and noncanonical trailing slash return JSON 404 without fallback or redirects',async t=>{
  let reads=0;
  const request=await http(t,createMarketIndexResponder({publicKeys,readSnapshot:async()=>{reads++;return signed(payload());},now:fixedTime}));
  for(const path of ['/api/market/v1/channels/beta/index',UPDATE_INDEX_PATH+'/', '/api/market/v1/update-index/stable']){
    const response=await request(path);assert.equal(response.status,404);assert.equal(response.headers.get('location'),null);
    assert.match(response.headers.get('content-type'),/^application\/json/);assert.equal((await response.json()).error.code,'CHANNEL_NOT_FOUND');
  }
  assert.equal(reads,0);
});

test('304 cannot extend expiry; missing, invalid, wrong-channel and untrusted snapshots return 503',async t=>{
  let clock=fixedTime,bytes=signed(payload());
  const request=await http(t,createMarketIndexResponder({publicKeys,readSnapshot:async()=>{if(bytes===null)throw Error('missing');return bytes;},now:()=>clock}));
  const response=await request();assert.equal(response.status,200);const etag=response.headers.get('etag');
  clock+=60000;
  const expired=await request(UPDATE_INDEX_PATH,{headers:{'If-None-Match':etag}});
  assert.equal(expired.status,503);assert.equal((await expired.json()).error.code,'INDEX_UNAVAILABLE');
  clock=fixedTime;
  for(const bad of [null,Buffer.from('<html>fallback</html>'),signed({...payload(),channel:'beta'}),Buffer.from('{}')]){
    bytes=bad;const result=await request();assert.equal(result.status,503);assert.equal(result.headers.get('etag'),null);
  }
  bytes=signed(payload());const untrusted=await http(t,createMarketIndexResponder({publicKeys:{},readSnapshot:async()=>bytes,now:clock}));
  assert.equal((await untrusted()).status,503);
});

test('rate limits, bounded snapshot size and timeout have explicit HTTP failures',async t=>{
  let reads=0;
  const limited=await http(t,createMarketIndexResponder({publicKeys,readSnapshot:async()=>{reads++;return signed(payload());},rateLimit:()=>({retryAfter:7}),now:fixedTime}));
  const response=await limited();assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'7');assert.equal(reads,0);
  const timeout=await http(t,createMarketIndexResponder({publicKeys,readSnapshot:()=>new Promise(()=>{}),timeoutMs:20,now:fixedTime}));
  assert.equal((await timeout()).status,503);
  const large=await http(t,createMarketIndexResponder({publicKeys,readSnapshot:async()=>new Uint8Array(1048577),now:fixedTime}));
  assert.equal((await large()).status,503);
});

test('file reader accepts bounded original bytes and rejects empty or oversized snapshots',async()=>{
  const root=await mkdtemp(join(tmpdir(),'market-index-read-'));
  try{
    const path=join(root,'index'),bytes=signed(payload());await writeFile(path,bytes);
    assert.deepEqual(await readMarketSnapshotFile(path),bytes);
    await assert.rejects(readMarketSnapshotFile(path,{limit:1}),/snapshot size/);
    await writeFile(path,'');await assert.rejects(readMarketSnapshotFile(path),/snapshot size/);
  }finally{await rm(root,{recursive:true,force:true});}
});

async function fixtureProject(root){
  const project=join(root,'project');await mkdir(project);
  await writeFile(join(project,'tool.config.json'),JSON.stringify({id:'update-http-test',version:'1.0.0',title:'Update HTTP test',
    description:'Isolated test release, not an official production publication.',capabilities:[],files:{html:'index.html',css:'style.css',js:'main.js'}}));
  await writeFile(join(project,'index.html'),'<main>Update test</main>');await writeFile(join(project,'style.css'),'');await writeFile(join(project,'main.js'),'void 0;');
  const tool=await createSidebarToolPackage(project),bytes=encodeSidebarToolPackage(tool);
  const release={toolId:tool.id,marketId:'opendesk/'+tool.id,kind:'sidebar-tool',version:tool.version,state:'published',
    packageTitle:tool.title,description:tool.description,capabilities:tool.capabilities,
    requirements:{format:tool.format,browserSdk:tool.requires?.browserSdk??null,uiRuntime:tool.uiRuntime??null},
    delivery:'package',publishedAt:new Date(fixedTime-1000).toISOString(),changelog:'Only tests the local publishing contract.',
    descriptor:{schema:'opendesk.market.release.v1',marketId:'opendesk/'+tool.id,version:tool.version,bytes:bytes.length,sha256:hash(bytes),
      packagePath:'/releases/opendesk/'+tool.id+'/'+tool.version+'/package.opendesk-tool.json'}};
  return {project,release,bytes};
}

test('original market builder publishes exact signed bytes beside compatible fixed six-field descriptors',async t=>{
  const root=await mkdtemp(join(tmpdir(),'market-index-build-'));
  try{
    const {project,release,bytes}=await fixtureProject(root),output=join(root,'site'),index=signed(payload([release]));
    const options={env:{OPENDESK_MARKET_SITE_OUTPUT:output},projects:[project],signedUpdateIndex:index,updatePublicKeys:publicKeys,now:fixedTime};
    const built=await buildMarketSite(options);
    assert.equal(built.updateIndex.sequence,1);assert.deepEqual(await readFile(join(output,MARKET_INDEX_FILE)),index);
    assert.deepEqual(await readFile(join(output,release.descriptor.packagePath)),bytes);
    assert.deepEqual(JSON.parse(await readFile(join(output,release.descriptor.packagePath.replace('package.opendesk-tool.json','descriptor.json')))),release.descriptor);
    const request=await http(t,createMarketIndexResponder({publicKeys,readSnapshot:()=>readMarketSnapshotFile(join(output,MARKET_INDEX_FILE)),now:fixedTime}));
    assert.deepEqual(Buffer.from(await (await request()).arrayBuffer()),index);
    const manifest=await readFile(join(output,'site-build.json'));
    await assert.rejects(buildMarketSite({...options,signedUpdateIndex:null}),/signed channel cannot be removed/);
    const conflicting=structuredClone(payload([release]));conflicting.releases[0].descriptor.sha256='a'.repeat(64);
    await assert.rejects(buildMarketSite({...options,signedUpdateIndex:signed(conflicting)}),/conflicting payload/);
    conflicting.sequence=2;
    await assert.rejects(buildMarketSite({...options,signedUpdateIndex:signed(conflicting)}),/Immutable signed release conflict/);
    await assert.rejects(buildMarketSite({...options,updatePublicKeys:{}}));
    assert.deepEqual(await readFile(join(output,'site-build.json')),manifest,'failed publications preserve previous complete output');
    const later=fixedTime+172800000;
    await buildMarketSite({...options,signedUpdateIndex:signed(payload([release],later,2)),now:later});
    await assert.rejects(buildMarketSite({...options,signedUpdateIndex:signed(payload([release],later,1)),now:later}),/sequence rollback/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('builder rejects signed metadata without matching original package and leaves no partial publication',async()=>{
  const root=await mkdtemp(join(tmpdir(),'market-index-artifacts-'));
  try{
    const {project,release}=await fixtureProject(root),output=join(root,'site');
    const wrong=structuredClone(release);wrong.capabilities=['storage.local'];
    await assert.rejects(buildMarketSite({env:{OPENDESK_MARKET_SITE_OUTPUT:output},projects:[project],
      signedUpdateIndex:signed(payload([wrong])),updatePublicKeys:publicKeys,now:fixedTime}),/metadata differs from actual package/);
    await assert.rejects(readFile(join(output,MARKET_INDEX_FILE)),{code:'ENOENT'});
  }finally{await rm(root,{recursive:true,force:true});}
});

test('actual existing dev:market server serves canonical index and unknown channel JSON',async t=>{
  const root=await mkdtemp(join(tmpdir(),'market-index-server-'));
  let child;
  try{
    const {project,release}=await fixtureProject(root),now=Date.now(),index=signed(payload([release],now));
    const snapshotFile=join(root,'stable.json'),keysFile=join(root,'keys.json');
    await writeFile(snapshotFile,index);await writeFile(keysFile,JSON.stringify(publicKeys));
    const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;
    await new Promise(resolve=>probe.close(resolve));
    const origin='http://127.0.0.1:'+port;
    child=spawn(process.execPath,['scripts/serve-market-site.mjs'],{cwd:process.cwd(),env:{...process.env,
      OPENDESK_MARKET_SITE_OUTPUT:join(root,'site'),OPENDESK_MARKET_DEV_ORIGIN:origin,
      OPENDESK_MARKET_PROJECTS:JSON.stringify([project]),OPENDESK_MARKET_SIGNED_INDEX_FILE:snapshotFile,OPENDESK_MARKET_UPDATE_KEYS_FILE:keysFile},stdio:['ignore','pipe','pipe']});
    let log='',errors='';child.stdout.on('data',chunk=>{log+=chunk;});child.stderr.on('data',chunk=>{errors+=chunk;});
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{cleanup();reject(Error('Market server startup timeout: '+errors));},30000);
      const poll=()=>{if(log.includes('"buildId"')){cleanup();resolve();}};
      const fail=code=>{cleanup();reject(Error('Market server exited '+code+': '+errors));};
      const cleanup=()=>{clearTimeout(timer);child.stdout.off('data',poll);child.off('exit',fail);};
      child.stdout.on('data',poll);child.once('exit',fail);poll();
    });
    const response=await fetch(origin+UPDATE_INDEX_PATH,{redirect:'manual'});
    assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^application\/json/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),index);
    const unknown=await fetch(origin+'/api/market/v1/channels/beta/index',{redirect:'manual'});
    assert.equal(unknown.status,404);assert.equal((await unknown.json()).error.code,'CHANNEL_NOT_FOUND');
  }finally{
    if(child&&child.exitCode===null){await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});}
    await rm(root,{recursive:true,force:true});
  }
});
