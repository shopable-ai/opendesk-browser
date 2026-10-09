import hashlib,json,pathlib,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[4]
REUSED=pathlib.Path('/Users/shopme/.codex/worktrees/sidebar-demo-r2-01a11f5a/opendesk-browser/docs/framework/evidence/sidebar-demo-r2-01a11f5a')
OUT=pathlib.Path(__file__).resolve().parent
def sha(b):return hashlib.sha256(b).hexdigest()
def read(p):return json.loads(pathlib.Path(p).read_text())
def file_record(p):
 p=pathlib.Path(p);b=p.read_bytes()
 return {'path':str(p),'sha256':sha(b),'bytes':len(b)}
def verify_rows(rows):
 for r in rows:
  p=pathlib.Path(r['path'])
  b=p.read_bytes()
  assert sha(b)==r['sha256'],str(p)
  if 'bytes' in r:assert len(b)==r['bytes'],str(p)
component=read(REUSED/'component-reuse-review.json')
assert component['candidate']==subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
verify_rows(component['rawEvidence'])
for r in component['inputs']:
 assert sha((ROOT/r['path']).read_bytes())==r['sha256'],r['path']
raw_log=next(pathlib.Path(r['path']).read_text() for r in component['rawEvidence'] if r['path'].endswith('.log'))
assert 'tests 70' in raw_log and 'pass 70' in raw_log and 'fail 0' in raw_log
identity=read(REUSED/'import-artifact-identity.json')
programs=[]
for p in identity['programs']:
 verify_rows(p['artifacts'])
 for r in p['readonlySourceSnapshots']+p.get('assets',[]):
  assert sha((ROOT/'examples/programs'/pathlib.Path(p['sourceDirectory']).name/r['relativePath']).read_bytes())==r['sha256'],r['relativePath']
 output=pathlib.Path(p['outputDirectory'])
 executable=(output/'program.js').read_bytes()
 artifact=read(output/'artifact.json')
 draft=read(output/'program.opendesk-draft.json')
 assert sha(executable)==artifact['sourceHash']==draft['build']['sourceHash']==p['sourceHash']
 assert executable==draft['sourceUtf8'].encode('utf-8')
 for r in draft['authoring']['files']:
  assert sha(r['sourceUtf8'].encode('utf-8'))==r['sha256']
 programs.append({'id':p['programId'],'sourceHash':sha(executable),'bytes':len(executable),'sourceSnapshots':len(draft['authoring']['files']),'assets':len(p.get('assets',[])),'decision':'REUSE_RECORDED_BUILD_IDENTITY'})
page=read(REUSED/'page-receipt-review.json')
for r in page['rawFiles']:
 assert sha(pathlib.Path(r['preservedPath']).read_bytes())==r['sha256']
 assert sha(pathlib.Path(r['producerPath']).read_bytes())==r['sha256']
assert len(page['runs'])==2
assert len({r['nonce'] for r in page['runs']})==2
assert all(r['status']=='PAGE_DEMO_OK' and r['proofCount']==1 for r in page['runs'])
assert len({r['documentId'] for r in page['runs']})==1
assert all(r['readonly'] and r['executionSha256']==programs[0]['sourceHash'] for r in page['readonlySwitches'])
ci={}
for job in [113696544107,113696544163,113696543907]:
 p=OUT/f'job-{job}.log';s=p.read_text()
 result=file_record(p)
 if job!=113696543907:
  assert 'REAL_CHROME_UNEXTENDED_RENDERER=FAIL' in s
  assert 'Permission denied (1100)' in s and 'MachPortRendezvous' in s
  assert 'REAL_CHROME_UNEXTENDED_RENDERER=PASS' not in s
  result['decision']='BARE_RENDERER_INFRASTRUCTURE_FAIL; NATIVE_E2E_NOT_TESTED'
 else:
  assert '# tests 317' in s and '# pass 312' in s and '# skipped 5' in s
  result['decision']='COMPONENT_AND_PACKAGE_PASS; FIVE_SKIPS_NOT_PROMOTED'
 ci[str(job)]=result
result={'candidate':component['candidate'],'decision':'REUSE_RECORDED_PASS_FOR_UNCHANGED_SCOPED_INPUTS','component':{'inputFilesCompared':len(component['inputs']),'tests':70,'pass':70,'fail':0,'rawEvidence':component['rawEvidence']},'programs':programs,'page':{'decision':'REUSE_RECORDED_REAL_PAGE_DEMO_RUNS','rawFileCount':len(page['rawFiles']),'runs':page['runs'],'sourceSwitchCount':len(page['readonlySwitches']),'scope':'Imported Page Demo only; no Controller/resource/native-bridge promotion'},'ci':ci,'referenceFiles':[file_record(REUSED/n) for n in ['component-reuse-review.json','import-artifact-identity.json','page-receipt-review.json']],'notTested':['Controller closure pending owner','Page UI resource/lifecycle closure pending owner','Codex Native E2E','independent F3/ZIP']}
(OUT/'reuse-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'decision':result['decision'],'componentInputs':len(component['inputs']),'componentPass':70,'programs':len(programs),'pageNativeRuns':2,'ciJobs':3},ensure_ascii=False))
