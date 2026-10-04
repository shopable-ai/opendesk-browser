from pathlib import Path
import subprocess,hashlib,json,datetime
ROOT=Path('/Users/shopme/Documents/workspace/opendesk-browser')
OUT=ROOT/'docs/framework/evidence/f2-sdk-relay-continuation'
assert Path.cwd()==ROOT
owned=['src/framework/sdk/entry.js','src/agents/page-relay.js']
tests=sorted(str(p.relative_to(ROOT)) for glob in ['k4-sdk*.test.mjs','k2-sdk-relay*.test.mjs'] for p in (ROOT/'tests/framework').glob(glob))
inputs=sorted(set(owned+tests+[str(p.relative_to(ROOT)) for directory in ['src/framework/sdk','src/framework/utils','src/platform/host','src/platform/storage','src/platform/page-port','src/platform/chrome'] for p in (ROOT/directory).rglob('*.js')]+['src/platform/protocol.js','src/framework/events.js','webpack.config.cjs','tests/framework/k2-sdk-broker.test.mjs']))
def snapshot():
 return {'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':{p:{'sha256':hashlib.sha256((ROOT/p).read_bytes()).hexdigest(),'bytes':(ROOT/p).stat().st_size} for p in inputs}}
commands=[('original-red',['node','docs/framework/evidence/f2-sdk-relay-continuation/original-red-reproductions.mjs','--baseline'],1),
 ('original-green',['node','docs/framework/evidence/f2-sdk-relay-continuation/original-red-reproductions.mjs'],0),
 ('original-exact-entry-reproducer',['node','docs/framework/evidence/f2-sdk-relay-continuation/original-entry-reproducer.mjs'],0),
 ('scoped-tests',['node','--test','--test-reporter=spec']+tests,0),
 ('sdk-and-service-integration-tests',['node','--test','--test-reporter=spec','tests/framework/k2-sdk-broker.test.mjs','tests/framework/k4-network.test.mjs','tests/framework/k4-chrome-services.test.mjs'],0),
 ('source-check',['npm','run','check'],0)]
results=[]
for name,argv,expected in commands:
 before=snapshot(); (OUT/f'{name}-source-before.json').write_text(json.dumps(before,indent=2)+'\n')
 proc=subprocess.run(argv,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 after=snapshot(); (OUT/f'{name}-source-after.json').write_text(json.dumps(after,indent=2)+'\n')
 log=OUT/f'{name}.log';log.write_text(proc.stdout)
 drift=[p for p in inputs if before['files'][p]!=after['files'][p]]
 highlights=[l for l in proc.stdout.splitlines() if l.startswith(('ℹ','Syntax checked','✔','✖'))]
 result={'name':name,'cwd':str(ROOT),'argv':argv,'exitCode':proc.returncode,'expectedExitCode':expected,'passedExpectation':proc.returncode==expected,
 'log':str(log.relative_to(ROOT)),'logSha256':hashlib.sha256(log.read_bytes()).hexdigest(),'sourceBefore':f'{name}-source-before.json','sourceAfter':f'{name}-source-after.json',
 'sourceDrift':drift,'ownedSourceStable':not any(p in owned or p in tests for p in drift),'highlights':highlights}
 results.append(result);print(json.dumps({k:result[k] for k in ['name','exitCode','expectedExitCode','sourceDrift','highlights']},ensure_ascii=False),flush=True)
report={'stage':'F2','task':'T09','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceOwnership':owned,'newTests':tests,
 'runtime':{'requestedModel':'gpt-6.1-sol','requestedReasoningEffort':'xhigh','actualResolvedModel':'unknown','actualResolvedReasoningEffort':'unknown',
 'reason':'Serving model/effort is not exposed; no global settings changed. Direct scoped executor; no recursive orchestration.'},
 'results':results,'finalOwnedSource':{p:after['files'][p] for p in owned+tests},'allExpectedExits':all(r['passedExpectation'] for r in results),
 'ownedSourceStable':all(r['ownedSourceStable'] for r in results),'native100AtomicAccepted':False,'stableProductPackageRebuilt':False,'F3':False,'original603':False,
 'boundary':'F2 scoped source and production/development exact-entry VM / Chrome callback / serial transaction tests. Every100 same-ID actual relay requests admitted at product SDK broker. Not real Chrome native100/IDB atomic acceptance, two actual Chrome MAIN file injections, or stable final package acceptance.',
 'parentContinues':['SDK grant epoch/recovery','stable package rebuild and native evidence'],'originalReviewUnmodified':True}
(OUT/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
raise SystemExit(0 if report['allExpectedExits'] and report['ownedSourceStable'] else 1)
