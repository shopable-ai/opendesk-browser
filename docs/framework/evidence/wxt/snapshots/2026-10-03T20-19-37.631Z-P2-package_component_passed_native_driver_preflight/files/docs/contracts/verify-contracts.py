#!/usr/bin/env python3
"""Stage01 artifact verifier, standard-library schema subset; not production runtime/tests."""
import json,hashlib,re,math,copy,datetime,subprocess,sys
from pathlib import Path
from urllib.parse import urlsplit
P=Path(__file__).resolve().parents[2];D=P/'docs/contracts';F=P/'contracts/fixtures'
def strict_pairs(pairs):
 d={}
 for k,v in pairs:
  if k in d:raise ValueError('duplicate JSON key '+k)
  d[k]=v
 return d
def read(p):return json.loads(p.read_text(),object_pairs_hook=strict_pairs,parse_constant=lambda s:(_ for _ in ()).throw(ValueError('nonfinite '+s)))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def canon(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def domain(v,depth=1,integer_only=False):
 if depth>12:raise ValueError('depth >12')
 if isinstance(v,dict):
  for k,x in v.items():
   if not k.isascii() or k in {'__proto__','constructor','prototype'}:raise ValueError('unsafe key')
   domain(x,depth+1,integer_only)
 elif isinstance(v,list):
  for x in v:domain(x,depth+1,integer_only)
 elif isinstance(v,str):v.encode('utf-8')
 elif isinstance(v,(int,float))and not isinstance(v,bool):
  if not math.isfinite(v)or (integer_only and (not isinstance(v,int) or abs(v)>9007199254740991)):raise ValueError('non-safe metadata number')
schema=read(D/'schema.json')
def kind(v):return 'null' if v is None else 'boolean' if isinstance(v,bool) else 'string' if isinstance(v,str) else 'object' if isinstance(v,dict) else 'array' if isinstance(v,list) else 'integer' if isinstance(v,int) else 'number' if isinstance(v,float) else 'invalid'
def eq(a,b):return kind(a)==kind(b) and a==b or kind(a)in ('number','integer')and kind(b)in ('number','integer')and a==b
def lookup(ptr):
 v=schema
 for k in ptr.removeprefix('#/').split('/'):v=v[k.replace('~1','/').replace('~0','~')]
 return v
def validate(v,s,path='$'):
 if '$ref'in s:return validate(v,lookup(s['$ref']),path)
 def fail(why):raise ValueError(path+': '+why)
 if 'const'in s and not eq(v,s['const']):fail('const')
 if 'enum'in s and not any(eq(v,x) for x in s['enum']):fail('enum')
 if 'type'in s:
  types=s['type']if isinstance(s['type'],list)else[s['type']];k=kind(v)
  if not(k in types or k=='integer'and'number'in types):fail('type '+str(types))
 for sub in s.get('allOf',[]):validate(v,sub,path)
 if 'if'in s:
  try:validate(v,s['if'],path);matches=True
  except ValueError:matches=False
  if matches and 'then'in s:validate(v,s['then'],path)
  if not matches and 'else'in s:validate(v,s['else'],path)
 if 'oneOf'in s:
  count=0
  for sub in s['oneOf']:
   try:validate(v,sub,path);count+=1
   except ValueError:pass
  if count!=1:fail('oneOf '+str(count))
 if isinstance(v,dict):
  if len(v)>s.get('maxProperties',10**9):fail('maxProperties')
  for k in s.get('required',[]):
   if k not in v:fail('required '+k)
  for k,x in v.items():
   props=s.get('properties',{})
   if k in props:validate(x,props[k],path+'/'+k)
   elif s.get('additionalProperties')is False:fail('unknown '+k)
   elif isinstance(s.get('additionalProperties'),dict):validate(x,s['additionalProperties'],path+'/'+k)
 if isinstance(v,list):
  if len(v)<s.get('minItems',0)or len(v)>s.get('maxItems',10**9):fail('array length')
  if s.get('uniqueItems')and len({canon(x)for x in v})!=len(v):fail('uniqueItems')
  for i,x in enumerate(v):
   if 'items'in s:validate(x,s['items'],path+'/'+str(i))
 if isinstance(v,str):
  if len(v)<s.get('minLength',0)or len(v)>s.get('maxLength',10**9):fail('string length')
  if 'pattern'in s and not re.search(s['pattern'],v):fail('pattern')
  if s.get('format')=='date-time':
   try:
    dt=datetime.datetime.fromisoformat(v.replace('Z','+00:00'));assert dt.tzinfo
   except Exception:fail('date-time')
 if kind(v)in('integer','number'):
  if not math.isfinite(v)or v<s.get('minimum',-math.inf)or v>s.get('maximum',math.inf):fail('number range')
def template(v):
 domain(v,integer_only=True);validate(v,schema['$defs']['TemplateRevision']);u=urlsplit(v['startUrl']);o=urlsplit(v['allowedOrigin'])
 if u.scheme not in ('http','https')or u.username or u.password or f'{u.scheme}://{u.netloc}'!=v['allowedOrigin']or o.path or o.query or o.fragment:raise ValueError('origin/url semantics')
 ids=[x['id']for x in v['fields']]
 if len(set(ids))!=len(ids)or set(v['columns'])!=set(ids):raise ValueError('field/column semantics')
 if (v['revision']==1)!=(v['parentRevision']is None)or v['revision']>1 and v['parentRevision']!=v['revision']-1:raise ValueError('parent revision')
 needed={'dom.top.v1','pagination.'+v['pagination']['mode']+'.v1'}
 for field in v['fields']:
  needed.add('read.'+field['read']+'.v1')
  if field['transforms']:needed.add('transform.safe.v1')
 if set(v['requiredCapabilities'])!=needed:raise ValueError('capability semantics')
 b=copy.deepcopy(v);del b['contentHash']
 if hashlib.sha256(canon(b)).hexdigest()!=v['contentHash']:raise ValueError('template hash')
checks=[]
def check(name,fn):
 fn();checks.append({'id':name,'result':'verified-artifact-only'})
def assert_(v,msg='assertion'):
 if not v:raise AssertionError(msg)
check('canonical-vector',lambda:assert_(canon(read(F/'canonical.json')['input']).decode()==read(F/'canonical.json')['canonicalUtf8']and hashlib.sha256(canon(read(F/'canonical.json')['input'])).hexdigest()==read(F/'canonical.json')['sha256']))
check('migration-template-public-schema',lambda:template(read(F/'migration/single-page/expected-template.json')))
# Evidence oracle intentionally contains dangerous-key payloads; parse as inert data, then validate mutated template.
neg=json.loads((F/'migration/template-rejection-vectors.json').read_text())['cases']
for case in neg:
 v=read(F/'migration/single-page/expected-template.json');m=case['input']['mutation'];parts=m['path'].removeprefix('/').split('/');cur=v
 for key in parts[:-1]:cur=cur[int(key)]if isinstance(cur,list)else cur[key]
 cur[int(parts[-1])if isinstance(cur,list)else parts[-1]]=m['value']
 try:template(v)
 except(ValueError,UnicodeError):checks.append({'id':'rejection-'+case['id'],'result':'rejected-artifact-as-expected'})
 else:raise AssertionError('negative template accepted '+case['id'])
c=read(D/'contract.json');m=read(D/'state-machines.json');sc=read(F/'scenarios.json');tasks=read(D/'task-breakdown.json');
check('version-alignment',lambda:assert_(all(x.get('contractVersion')=='1.0.0'for x in[c,m,sc,tasks])))
ids={x['id']for x in sc['cases']};check('planned-scenarios-have-outcomes',lambda:assert_(len(ids)==len(sc['cases'])and all(x['status']=='planned-not-executed'and x['steps']and x['expected']for x in sc['cases'])))
taskmap={t['id']:t for t in tasks['tasks']};visited=set();active=set()
def visit(i):
 if i in active:raise AssertionError('task DAG cycle '+i)
 if i in visited:return
 assert_(i in taskmap,'task absent '+i);active.add(i)
 for j in taskmap[i]['dependsOn']:visit(j)
 active.remove(i);visited.add(i)
for i in taskmap:visit(i)
check('task-dag-and-nine-categories',lambda:assert_(len(visited)==len(taskmap)and len(tasks['nineCategories'])==9))
plan=read(D/'test-plan.json');plan_ids=set()
for key in ['tests','gates','cases','scenarioCases','supplementalCases','migrationCases','newTypeVectors']:
 for x in plan.get(key,[]):plan_ids.add(x.get('id',''))
migration_ids=set()
for v in (F/'migration').rglob('vector*.json'):
 data=read(v)
 if 'id'in data:migration_ids.add(data['id'])
 for x in data.get('cases',[]):migration_ids.add(x['id'])
for t in tasks['tasks']:
 assert_(all(t[k]for k in ['ownerStage','inputs','writeScope','deliverables','observableAssertions','readyWhen','blockers']),t['id']+' incomplete')
 for id in t['testIds']:assert_(id in ids or id in migration_ids or id in plan_ids or re.fullmatch('M(0[1-9]|1[01])',id),t['id']+' unknown test '+id)
checks.append({'id':'work-package-concrete-input-output-tests','result':'verified-artifact-only'})
check('transaction-template-structure-hash',lambda:template(read(F/'transaction-template.json')))
page=read(F/'page-transaction.json')
for request in page['stageRequests']:
 validate(request,schema['$defs']['StageRequest']);body={k:request[k]for k in ['snapshotId','batchIndex','records']};assert_(request['digest']==hashlib.sha256(canon(body)).hexdigest()and request['utf8Bytes']==len(canon(body)),'stage exact bytes/digest')
validate(page['sealRequest'],schema['$defs']['SealRequest']);seal=page['sealRequest'];rows=[x for b in page['stageRequests']for x in b['records']];assert_(seal['rowCount']==len(rows)and seal['byteCount']==sum(x['utf8Bytes']for x in page['stageRequests'])and seal['batchDigests']==[x['digest']for x in page['stageRequests']]and seal['pageSignature']==hashlib.sha256(canon({'pageIdentity':seal['pageIdentity'],'records':[{'raw':r['raw'],'values':r['values']}for r in rows]})).hexdigest(),'seal exact input')
checks.append({'id':'precise-three-batch-vectors-shape-digests-counts','result':'verified-artifact-only'})
download=read(F/'download-attempts.json')
for key in ['attemptA','attemptB']:validate(download[key],schema['$defs']['DownloadAttempt'])
assert_(download['attemptA']['blobUrl']!=download['attemptB']['blobUrl']and download['attemptA']['attemptId']!=download['attemptB']['attemptId']and download['attemptA']['exportJobId']!=download['attemptB']['exportJobId'],'attempt isolation')
checks.append({'id':'download-attempt-distinct-identity-vectors','result':'verified-artifact-only'})
command=read(F/'read-command.json');validate(command['plan'],schema['$defs']['RulePlan']);validate(command['command'],schema['$defs']['Command'])
checks.append({'id':'fixed-read-command-payload-shape','result':'verified-artifact-only'})
assert_(len(plan['gates'])==11 and {x['id']for x in plan['gates']}=={'M'+str(i).zfill(2)for i in range(1,12)},'M01-M11 gate registry')
checks.append({'id':'all-eleven-technical-gates-indexed','result':'verified-artifact-only'})

ledger=read(D/'source-ledger.json');count=0
for src in ledger['sources']:
 for f in src['files']:
  p=Path(src['snapshotPath'])/f['path'];assert_(p.exists()and sha(p)==f['sha256']and p.stat().st_size==f['bytes'],'snapshot mismatch '+str(p));count+=1
checks.append({'id':'source-snapshot-byte-integrity','count':count,'result':'verified-artifact-only'})
# Keep runtime evidence immutable; only record exact context fields read from session.
roll=Path('/Users/shopme/.codex/sessions/2026/10/01/rollout-2026-10-01T11-26-25-01a0f8b7-b974-7962-a5fc-a77bb0bd6277.jsonl');ctx=[]
for line in roll.open():
 x=json.loads(line)
 if x.get('type')=='turn_context':ctx.append({'timestamp':x.get('timestamp'),'model':x['payload'].get('model'),'effort':x['payload'].get('effort')})
assert_(ctx[-1]['effort']=='xhigh','current turn effort not xhigh');checks.append({'id':'actual-current-turn-context','result':'verified-read-only','evidence':ctx[-1]})
probe=read(D/'classic-probe.json');check('classic-probe-metadata-only',lambda:assert_(probe['productPassed']is False and all(x['classicParse']and x['topLevelModuleSyntax']==0 and x['dynamicImports']==0 and x['executeScriptEvaluationResult']=='undefined'for x in probe['results'])))
# Supplementary design artifact checks, never runtime acceptance.
def walk_refs(v):
 if isinstance(v,dict):
  if '$ref'in v:lookup(v['$ref'])
  for x in v.values():walk_refs(x)
 elif isinstance(v,list):
  for x in v:walk_refs(x)
check('all-schema-references-resolve',lambda:walk_refs(schema))
validate({'hostDocumentId':'host-doc','registrationId':'reg','projection':{'run':None,'pendingCommandIds':[],'exportJobIds':[],'eventSeq':0,'slotAvailable':True}},schema['$defs']['RegisterHostResponse'])
checks.append({'id':'idle-registration-projection-schema','result':'verified-artifact-only'})
wire=read(F/'page-read-frames.json');validate(wire['beginPageRequest'],schema['$defs']['BeginPageRequest']);raw=[]
for i,frame in enumerate(wire['frames']):
 validate(frame,schema['$defs']['PageReadFrame']);assert_(frame['frameIndex']==i and frame['rowStart']==len(raw),'frame continuity');body={k:frame[k]for k in ['snapshotId','frameIndex','rowStart','rawRows']};assert_(frame['digest']==hashlib.sha256(canon(body)).hexdigest(),'raw frame digest');raw+=frame['rawRows']
end=wire['end'];validate(end,schema['$defs']['PageReadFrame']);assert_(end['rowCount']==len(raw)and end['frameCount']==len(wire['frames'])and end['rawSignature']==hashlib.sha256(canon({'pageIdentity':end['pageIdentity'],'rawRows':raw})).hexdigest(),'raw end counts/signature')
checks.append({'id':'exact-raw-frame-begin-end-wire','result':'verified-artifact-only'})
fix=read(F/'protocol-repair-vectors.json');empty=fix['zeroBatchPage'];template(empty['template']);validate(empty['beginPageRequest'],schema['$defs']['BeginPageRequest']);validate(empty['openSnapshot'],schema['$defs']['PageSnapshot']);validate(empty['end'],schema['$defs']['PageReadEnd']);assert_(empty['end']['frameCount']==empty['end']['rowCount']==empty['openSnapshot']['batchCount']==0,'zero batch empty entry')
checks.append({'id':'zero-batch-page-complete-declarations','result':'verified-artifact-only'})
sig=read(F/'page-signature.json');assert_(canon(sig['baseEnvelope']).decode()==sig['canonicalUtf8']and hashlib.sha256(canon(sig['baseEnvelope'])).hexdigest()==sig['sha256']and hashlib.sha256(canon(sig['changedEnvelope'])).hexdigest()==sig['changedSha256']!=sig['sha256'],'signature independence and last row delta')
checks.append({'id':'page-signature-identity-independent-exact-oracle','result':'verified-artifact-only'})
cmd=command['command'];assert_(cmd['digest']==hashlib.sha256(canon({k:cmd[k]for k in ['commandId','identity','kind','payload']})).hexdigest(),'command digest');assert_(command['plan']['planHash']==hashlib.sha256(canon({k:v for k,v in command['plan'].items()if k!='planHash'})).hexdigest(),'plan digest')
checks.append({'id':'fixed-command-and-plan-digests','result':'verified-artifact-only'})
all_cases=plan['scenarioCases']+plan['supplementalCases']+plan['migrationCases']+plan['newTypeVectors']+plan['preciseFixtureCases'];all_ids=[x['id']for x in all_cases];assert_(len(all_ids)==len(set(all_ids)),'plan case duplicate');known=set(all_ids)|{'suite:'+x['id']for x in plan['fixtureVectorSuites']}
for gate in plan['gates']:
 for id in gate['caseIds']:assert_(id in known,'gate dangling '+id)
for case in fix['cases']:assert_(case['id']in known and case['productResult']=='not-run','repair vector mapping')
checks.append({'id':'plan-cases-gate-refs-repair-vector-mapping','count':len(all_cases),'result':'verified-artifact-only'})
assert_(tasks['executionOrder']==['01','02A','02B','03','04']and taskmap['WP02']['ownerStage']=='02A'and all(taskmap[x]['ownerStage']=='02B'for x in ['WP04','WP05','WP07A','WP08A']),'v5 owner split')
checks.append({'id':'v5-environment-foundation-domain-owner-split','result':'verified-artifact-only'})
delta=read(D/'source-delta-ledger.json')
for x in delta['files']:assert_(sha(P/x['deltaSnapshotPath'])==x['deltaCapturedHash']and (P/x['deltaSnapshotPath']).stat().st_size==x['bytes'],'delta bytes mismatch')
checks.append({'id':'source-delta-byte-integrity','count':len(delta['files']),'result':'verified-artifact-only'})
beh=read(D/'source-behaviors.json');refs=0
for section in ['sourceChains','behaviors','licenseEvidence']:
 for item in beh[section]:
  for e in item['evidence']:
   q=Path(e['path']);assert_(q.exists()and sha(q)==e['sha256'],'source citation bytes');assert_(1<=e['startLine']<=e['endLine']<=len(q.read_text(errors='replace').splitlines()),'source citation line range');refs+=1
checks.append({'id':'behavior-source-citation-hashes-lines','count':refs,'result':'verified-artifact-only'})
source=read(F/'source-selection.json')
for key,definition in [('context','SourceSelectionContext'),('startRequest','StartSourceSelectionRequest'),('selectedResult','SourceSelectionResult'),('cancelRequest','CancelSourceSelectionRequest'),('releaseRequest','ReleaseSourceContextRequest'),('previewRequest','PreviewSourceRequest')]:
 validate(source[key],schema['$defs'][definition])
preview=source['previewRequest'];template(preview['draft']);assert_(preview['plan']['templateHash']==preview['draft']['contentHash'] and preview['plan']['planHash']==hashlib.sha256(canon({k:v for k,v in preview['plan'].items()if k!='planHash'})).hexdigest(),'source preview draft/plan binding')
for case in source['cases']:assert_(case['id']in known,'source case unmapped')
checks.append({'id':'source-selection-preview-public-wire-and-draft-plan','count':6,'result':'verified-artifact-only'})
reuse=read(D/'reuse-decision.json');handoff=Path(reuse['stage05Handoff']['path']);assert_(sha(handoff)==reuse['stage05Handoff']['sha256'],'stage05 handoff hash');audit=read(handoff)
for artifact in audit['artifacts']:
 q=Path(artifact['path']);assert_(q.exists()and sha(q)==artifact['sha256']and q.stat().st_size==artifact['bytes'],'stage05 artifact bytes '+str(q))
assert_(len(reuse['decisions'])==54 and len(reuse['dynamicEdges'])==29 and reuse['designUnresolvedCriticalTransferDecisions']==0,'finite reuse decisions')
reuse_refs=0
for decision in reuse['decisions']:
 for e in decision['sources']:
  q=Path(e['verifiedCapturedPath']);assert_(sha(q)==e['hash']and 1<=e['lineStart']<=e['lineEnd']<=len(q.read_text(errors='replace').splitlines()),'reuse source hash/lines');reuse_refs+=1
for edge in reuse['dynamicEdges']:
 for case_id in edge['testIds']:assert_(case_id in known,'reuse edge test unmapped '+case_id)
checks.append({'id':'actual-stage05-artifact-reuse-edge-integrity','artifacts':len(audit['artifacts']),'sourceRefs':reuse_refs,'decisions':54,'edges':29,'result':'verified-artifact-only'})
report={'stage':'01','artifactValidation':'verified','productTests':'not-run','generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':checks,'schemaValidatorScope':'stdlib validator implements only keywords present in current schema; real CSS/URL DOM/external runtime behaviors untested','snapshotFilesVerified':count,'designFixtureResultIsProductAcceptance':False,'gaps':['No production implementation or Chrome product execution.','No complete JSON Schema conformance suite; only present keyword subset and rejection fixtures checked.','VM classic probe is loading-state initialization, not browser selection equivalence.']}
(D/'artifact-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'artifactValidation':'verified','checks':len(checks),'snapshotFiles':count,'productTests':'not-run'},ensure_ascii=False))
